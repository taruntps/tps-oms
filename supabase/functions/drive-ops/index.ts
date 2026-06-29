// Edge Function: drive-ops
// Handles all Google Drive operations using a service account stored in Supabase Vault.
// Actions: create-folder | list-files | trash | upload | create-gdoc | create-gsheet | download

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str)
}

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Impersonation email for Google Drive domain-wide delegation.
// Stored as an env var so it doesn't break if the admin email ever changes.
const DRIVE_SUB_EMAIL = Deno.env.get('DRIVE_SUB_EMAIL') ?? 'tarun@tpsxpert.com'

const CORS = {
  'Access-Control-Allow-Origin':  'https://portal.tpsxpert.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function unauthorized(msg = 'Unauthorized') {
  return new Response(JSON.stringify({ error: msg }), {
    status: 401,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── Deno-native RSA-SHA256 JWT signing ────────────────────────────────────────
function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function b64url(data: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array
  if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data)
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data)
  } else {
    bytes = data
  }
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function makeJWT(sa: { client_email: string; private_key: string; token_uri: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    sub: DRIVE_SUB_EMAIL,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  }))
  const sigInput = `${header}.${payload}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(sigInput))
  return `${sigInput}.${b64url(sig)}`
}

async function getAccessToken(sa: { client_email: string; private_key: string; token_uri: string }): Promise<string> {
  const jwt  = await makeJWT(sa)
  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  const res  = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`)
  return data.access_token as string
}

// ── Drive API helpers ─────────────────────────────────────────────────────────
async function drivePost(path: string, token: string, body: unknown) {
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function driveGet(path: string, token: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // ── Caller authentication ─────────────────────────────────────────────────
  // Verify the request carries a valid Supabase user JWT.
  // Without this check, anyone with the anon key could read/write/trash the
  // entire company Google Drive. This was the #1 critical security finding.
  const authHeader = req.headers.get('Authorization') ?? ''
  const callerToken = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!callerToken) return unauthorized('Missing Authorization header')

  const callerSupa = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user: caller }, error: callerErr } = await callerSupa.auth.getUser(callerToken)
  if (callerErr || !caller) return unauthorized('Invalid or expired token')

  // Fetch the caller's profile to check their role.
  // Auditors have read-only access (list/download). Write ops require staff role.
  const { data: callerProfile } = await callerSupa
    .from('profiles')
    .select('role, is_active')
    .eq('id', caller.id)
    .single()

  if (!callerProfile?.is_active) return unauthorized('Account is inactive')

  const callerRole = callerProfile?.role ?? ''
  const isReadOnly = callerRole === 'auditor'

  try {
    const { action, ...params } = await req.json()

    // Auditors cannot mutate Drive (create/upload/trash)
    const mutatingActions = ['create-folder', 'create-gdoc', 'create-gsheet', 'upload', 'trash']
    if (isReadOnly && mutatingActions.includes(action)) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Read SA credentials from Vault via service role
    const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: saJson, error: vaultErr } = await supa.rpc('get_google_sa_json')
    if (vaultErr) throw new Error(`Vault error: ${vaultErr.message}`)
    const sa = typeof saJson === 'string' ? JSON.parse(saJson) : saJson

    const token = await getAccessToken(sa)

    // ── create-folder ─────────────────────────────────────────────────────────
    if (action === 'create-folder') {
      const { name, parentId } = params as { name: string; parentId: string }
      const result = await drivePost('/files?fields=id,name,webViewLink', token, {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      })
      if (!result.id) throw new Error(`Drive error: ${JSON.stringify(result)}`)
      return new Response(JSON.stringify({ folderId: result.id }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── create-gdoc ───────────────────────────────────────────────────────────
    if (action === 'create-gdoc') {
      const { name, folderId } = params as { name: string; folderId: string }
      const result = await drivePost('/files?fields=id,name,webViewLink', token, {
        name,
        mimeType: 'application/vnd.google-apps.document',
        parents: [folderId],
      })
      if (!result.id) throw new Error(`Drive error: ${JSON.stringify(result)}`)
      return new Response(JSON.stringify({ fileId: result.id, webViewLink: result.webViewLink }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── create-gsheet ─────────────────────────────────────────────────────────
    if (action === 'create-gsheet') {
      const { name, folderId } = params as { name: string; folderId: string }
      const result = await drivePost('/files?fields=id,name,webViewLink', token, {
        name,
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: [folderId],
      })
      if (!result.id) throw new Error(`Drive error: ${JSON.stringify(result)}`)
      return new Response(JSON.stringify({ fileId: result.id, webViewLink: result.webViewLink }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── list-files ────────────────────────────────────────────────────────────
    if (action === 'list-files') {
      const { folderId } = params as { folderId: string }
      const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`)
      const result = await driveGet(
        `/files?q=${q}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&orderBy=folder,name`,
        token,
      )
      return new Response(JSON.stringify({ files: result.files ?? [] }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── trash ─────────────────────────────────────────────────────────────────
    if (action === 'trash') {
      const { fileId } = params as { fileId: string }
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      })
      const result = await res.json()
      return new Response(JSON.stringify({ ok: true, id: result.id }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── upload ────────────────────────────────────────────────────────────────
    if (action === 'upload') {
      const { folderId, name, mimeType, content } = params as {
        folderId: string; name: string; mimeType: string; content: string
      }
      const meta = JSON.stringify({ name, parents: [folderId] })
      const boundary = 'tps_boundary_xyzabc'
      const body = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        meta,
        `--${boundary}`,
        `Content-Type: ${mimeType}`,
        'Content-Transfer-Encoding: base64',
        '',
        content,
        `--${boundary}--`,
      ].join('\r\n')

      const res = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body,
        },
      )
      const result = await res.json()
      if (!result.id) throw new Error(`Upload error: ${JSON.stringify(result)}`)
      return new Response(JSON.stringify({ fileId: result.id, name: result.name, webViewLink: result.webViewLink }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── download (for in-portal preview) ─────────────────────────────────────
    if (action === 'download') {
      const { fileId, mimeType } = params as { fileId: string; mimeType: string }

      const isGDoc   = mimeType === 'application/vnd.google-apps.document'
      const isGSheet = mimeType === 'application/vnd.google-apps.spreadsheet'
      const isGSlide = mimeType === 'application/vnd.google-apps.presentation'
      const isGWorkspace = isGDoc || isGSheet || isGSlide

      // Google Workspace files must be exported; regular files downloaded directly
      const downloadUrl = isGWorkspace
        ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`
        : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`

      const dlRes = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!dlRes.ok) {
        const err = await dlRes.text()
        throw new Error(`Download failed (${dlRes.status}): ${err}`)
      }

      const responseContentType = isGWorkspace ? 'application/pdf' : (dlRes.headers.get('content-type') ?? mimeType)
      const buffer = await dlRes.arrayBuffer()
      const base64 = toBase64(buffer)

      return new Response(JSON.stringify({ base64, contentType: responseContentType }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('drive-ops error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
