// Admin: change a user's LOGIN email. The email is the Supabase Auth sign-in identity, so a
// plain profiles update would not change how they log in - this updates the Auth user via the
// admin API (email_confirm so it works immediately, no confirmation mail) and mirrors it onto
// the profile. verify_jwt is ON and the caller must be super_admin or director.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const ADMIN_ROLES = new Set(['super_admin', 'director'])
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Identify caller, then require an admin role.
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(SB_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'unauthorized' }, 401)
  const admin = createClient(SB_URL, SERVICE)
  const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!prof || !ADMIN_ROLES.has(prof.role)) return json({ error: 'forbidden' }, 403)

  let payload: any = {}
  try { payload = await req.json() } catch { /* ignore */ }
  const userId = String(payload?.userId ?? '').trim()
  const email = String(payload?.email ?? '').trim().toLowerCase()
  if (!userId) return json({ error: 'Missing userId' }, 400)
  if (!EMAIL_RE.test(email)) return json({ error: 'Enter a valid email address' }, 400)

  // Update the Auth sign-in identity.
  const { error: authErr } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true })
  if (authErr) return json({ ok: false, error: authErr.message }, 200)

  // Mirror onto the profile row so the app shows the new address.
  const { error: profErr } = await admin.from('profiles').update({ email }).eq('id', userId)
  if (profErr) return json({ ok: false, error: profErr.message }, 200)

  return json({ ok: true })
})
