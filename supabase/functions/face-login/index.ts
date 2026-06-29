// Edge Function: face-login
// Resolves identifier → user, compares the AVERAGED live face descriptor
// (3-frame consensus from the client) against the enrolled one, and returns
// a magic-link token_hash on success.
//
// Security design:
//   - Client sends an averaged descriptor from 3 consecutive good frames.
//   - Server compares against the enrolled descriptor at threshold 0.50.
//   - Threshold 0.50 is the industry-standard cosine similarity floor for
//     @vladmandic/human face embeddings.  A different person's averaged
//     descriptor virtually never crosses this on someone else's enrollment.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return Math.max(0, dot / (Math.sqrt(na) * Math.sqrt(nb)))
}

// 0.50 — industry standard for @vladmandic/human face embeddings.
// Raising from 0.40 because the client now sends a 3-frame average,
// which is more stable and reliably above 0.50 for the correct person.
const THRESHOLD = 0.50

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { identifier, faceDescriptor } = await req.json() as {
      identifier: string
      faceDescriptor: number[]
    }

    if (!identifier?.trim()) throw new Error('identifier is required')
    if (!Array.isArray(faceDescriptor) || faceDescriptor.length === 0)
      throw new Error('faceDescriptor is required')

    const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── Resolve identifier → userId + email ────────────────────────────────────
    let email:  string | null = null
    let userId: string | null = null

    if (identifier.includes('@')) {
      email = identifier.trim().toLowerCase()
      const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 })
      const match = users?.find(u => u.email?.toLowerCase() === email)
      if (match) userId = match.id
    } else {
      const { data: profile, error } = await admin
        .from('profiles')
        .select('id, email')
        .eq('employee_code', identifier.trim().toUpperCase())
        .maybeSingle()
      if (error) throw new Error(`Profile lookup failed: ${error.message}`)
      if (profile) { userId = profile.id; email = profile.email }
    }

    if (!userId) throw new Error('User not found')

    // ── Fetch enrolled descriptor ──────────────────────────────────────────────
    const { data: profile, error: profErr } = await admin
      .from('profiles')
      .select('face_descriptor, email')
      .eq('id', userId)
      .single()

    if (profErr) throw new Error(`Profile fetch failed: ${profErr.message}`)

    const enrolled: number[] | null = profile?.face_descriptor ?? null
    if (!enrolled || enrolled.length === 0)
      throw new Error('No face enrolled for this account — use password to sign in.')

    if (!email) email = profile?.email ?? null
    if (!email) throw new Error('Cannot determine email for this account')

    // ── Compare (averaged 3-frame client descriptor vs enrolled) ──────────────
    const score = cosineSimilarity(faceDescriptor, enrolled)
    console.log(`face-login: identifier=${identifier} score=${score.toFixed(4)} threshold=${THRESHOLD} pass=${score >= THRESHOLD}`)

    if (score < THRESHOLD)
      throw new Error(`Face not recognized — please use your password to sign in.`)

    // ── Issue magic-link OTP ───────────────────────────────────────────────────
    const { data: otpData, error: otpErr } = await admin.auth.admin.generateLink({
      type:  'magiclink',
      email: email,
    })
    if (otpErr) throw new Error(`OTP generation failed: ${otpErr.message}`)

    const token_hash = (otpData as any)?.properties?.hashed_token
      ?? (otpData as any)?.properties?.token_hash

    if (!token_hash) throw new Error('Could not generate login token')

    return new Response(JSON.stringify({ token_hash, score }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('face-login error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
