// Send a free-text WhatsApp reply from the portal Inbox (allowed within the 24h
// customer-service window; Meta errors otherwise and we surface it). verify_jwt is ON and we
// additionally require an admin role. Records the sent reply in wa_messages.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const ADMIN_ROLES = new Set(['super_admin', 'director', 'hr'])
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Identify the caller from their JWT, then require an admin role.
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(SB_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'unauthorized' }, 401)
  const admin = createClient(SB_URL, SERVICE)
  const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!prof || !ADMIN_ROLES.has(prof.role)) return json({ error: 'forbidden' }, 403)

  let payload: any = {}
  try { payload = await req.json() } catch { /* ignore */ }
  const phone = String(payload?.to ?? '').replace(/\D/g, '')
  const text = String(payload?.body ?? '').trim()
  if (phone.length < 10 || !text) return json({ error: 'Enter a valid number and message' }, 400)

  const { data: rows } = await admin.from('app_settings').select('key, value').in('key', ['whatsapp_api_key', 'whatsapp_phone_number_id'])
  const cfg: Record<string, string> = Object.fromEntries((rows ?? []).map((r: any) => [r.key, r.value ?? '']))
  if (!cfg.whatsapp_api_key || !cfg.whatsapp_phone_number_id) return json({ error: 'Meta credentials missing' }, 400)

  const url = `https://graph.facebook.com/v20.0/${cfg.whatsapp_phone_number_id}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.whatsapp_api_key}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } }),
  })
  const data = await res.json().catch(() => ({}))
  if (res.ok && data?.messages?.[0]?.id) {
    await admin.from('wa_messages').insert({ direction: 'out', wa_phone: phone, body: text, msg_type: 'text', wa_message_id: data.messages[0].id, status: 'sent' })
    return json({ ok: true, id: data.messages[0].id })
  }
  const msg = data?.error?.message ? String(data.error.message).slice(0, 300) : `HTTP ${res.status}`
  return json({ error: msg }, 400)
})
