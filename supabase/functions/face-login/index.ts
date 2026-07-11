// Edge Function: face-login (server-side AWS Rekognition)
// Resolves identifier -> user, compares a submitted PHOTO against the user's
// registered reference face (face-refs bucket) via AWS Rekognition CompareFaces,
// and returns a magic-link token_hash on success. No on-device face engine.
//
// Payload: { identifier: string, photo: base64 }
// Reuses the same reference face that attendance enrollment stores.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { rekognition } from '../_shared/rekognition.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { identifier, photo } = await req.json() as { identifier: string; photo: string }
    if (!identifier?.trim()) throw new Error('identifier is required')
    if (!photo) throw new Error('photo is required')

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Resolve identifier -> userId + email
    let email: string | null = null
    let userId: string | null = null
    if (identifier.includes('@')) {
      email = identifier.trim().toLowerCase()
      const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 })
      userId = users?.find(u => u.email?.toLowerCase() === email)?.id ?? null
    } else {
      const { data: p } = await admin.from('profiles').select('id, email')
        .eq('employee_code', identifier.trim().toUpperCase()).maybeSingle()
      if (p) { userId = p.id; email = p.email }
    }
    if (!userId) throw new Error('User not found')
    if (!email) {
      const { data: p } = await admin.from('profiles').select('email').eq('id', userId).single()
      email = p?.email ?? null
    }
    if (!email) throw new Error('Cannot determine email for this account')

    // Fetch the registered reference face (same one attendance uses).
    const { data: ref } = await admin.storage.from('face-refs').download(`${userId}/reference.jpg`)
    if (!ref) throw new Error('No face registered for this account — use your password to sign in.')

    // Threshold (Rekognition %) — reuse the attendance setting; default 90%.
    const { data: settings } = await admin.from('attendance_settings').select('face_match_threshold').maybeSingle()
    const thresholdPct = Math.round((Number(settings?.face_match_threshold ?? 0.90)) * 100)

    // Compare submitted photo against the reference (8s cap).
    const refBytes = new Uint8Array(await ref.arrayBuffer())
    let s = ''; for (let i = 0; i < refBytes.length; i++) s += String.fromCharCode(refBytes[i])
    const refB64 = btoa(s)
    const cmp = await Promise.race([
      rekognition('CompareFaces', { SourceImage: { Bytes: refB64 }, TargetImage: { Bytes: photo }, SimilarityThreshold: 1 }),
      new Promise<null>(r => setTimeout(() => r(null), 8000)),
    ]) as any
    if (cmp == null) throw new Error('Face check timed out — use your password to sign in.')
    const score = cmp.FaceMatches?.[0]?.Similarity ?? 0
    if (score < thresholdPct) throw new Error('Face not recognized — use your password to sign in.')

    // Issue magic-link OTP
    const { data: otpData, error: otpErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    if (otpErr) throw new Error(`OTP generation failed: ${otpErr.message}`)
    const token_hash = (otpData as any)?.properties?.hashed_token ?? (otpData as any)?.properties?.token_hash
    if (!token_hash) throw new Error('Could not generate login token')

    return new Response(JSON.stringify({ token_hash, score }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (e: unknown) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
