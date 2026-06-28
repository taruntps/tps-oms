// Edge Function: face-login
// Resolves identifier → user, compares live face descriptor against the
// enrolled one, and returns a magic-link token_hash on success.
// The front-end then calls supabase.auth.verifyOtp({ token_hash, type:'magiclink' }).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Cosine similarity in [0, 1].
function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return Math.max(0, dot / (Math.sqrt(na) * Math.sqrt(nb)))
}

// Minimum cosine similarity to accept as a match.
// 0.40 works well for real-world conditions (varying light / angle).
// Raise to 0.45 for stricter security once staff are reliably enrolled.
const THRESHOLD = 0.40

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

    const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!
    const SERVICE_ROLE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Resolve identifier: try as email first, then employee_code.
    let email: string | null = null
    let userId: string | null = null

    if (identifier.includes('@')) {
      email = identifier.trim().toLowerCase()
      // Look up user by email via auth admin API.
      const { data: users } = await admin.auth.admin.listUsers({ perPage: 1, page: 1 })
      const match = users?.users?.find(u => u.email?.toLowerCase() === email)
      if (match) userId = match.id
    } else {
      // Resolve employee_code → user id via profiles table.
      const { data: profile, error } = await admin
        .from('profiles')
        .select('id, email')
        .eq('employee_code', identifier.trim().toUpperCase())
        .maybeSingle()
      if (error) throw new Error(`Profile lookup failed: ${error.message}`)
      if (profile) { userId = profile.id; email = profile.email }
    }

    if (!userId) throw new Error('User not found')

    // Fetch the enrolled face descriptor from profiles.
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

    // Compare descriptors.
    const score = cosineSimilarity(faceDescriptor, enrolled)
    if (score < THRESHOLD)
      throw new Error(`Face not recognized (score ${score.toFixed(3)} < ${THRESHOLD}) — use password to sign in.`)

    // Generate a magic-link OTP so the client can log in without a password.
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
