// WhatsApp inbound webhook. Meta calls this for every reply to the campaign number and for
// delivery/read statuses. Stores inbound messages in wa_messages (surfaced in the portal
// Inbox) and auto-adds STOP repliers to wa_opt_outs. verify_jwt is OFF — Meta calls it with
// no Supabase JWT; the GET handshake is guarded by our own verify token.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const STOP_WORDS = new Set(['stop', 'unsubscribe', 'stop promotions', 'stop all', 'unsubscribe me'])

serve(async (req) => {
  const admin = createClient(SB_URL, SERVICE)
  const url = new URL(req.url)

  // 1) One-time webhook verification handshake (Meta GET).
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    const { data } = await admin.from('app_settings').select('value').eq('key', 'whatsapp_webhook_verify_token').maybeSingle()
    const expected = data?.value ?? ''
    if (mode === 'subscribe' && token && expected && token === expected) {
      return new Response(challenge ?? '', { status: 200 })
    }
    return new Response('forbidden', { status: 403 })
  }

  // 2) Event delivery (Meta POST). Always answer 200 so Meta doesn't retry-storm.
  if (req.method === 'POST') {
    let payload: any = {}
    try { payload = await req.json() } catch { /* ignore malformed */ }
    try {
      for (const entry of (payload?.entry ?? [])) {
        for (const change of (entry?.changes ?? [])) {
          const value = change?.value ?? {}
          const nameByWa: Record<string, string> = {}
          for (const c of (value?.contacts ?? [])) { if (c?.wa_id) nameByWa[c.wa_id] = c?.profile?.name ?? '' }

          // Inbound customer messages.
          for (const msg of (value?.messages ?? [])) {
            const from = String(msg?.from ?? '').replace(/\D/g, '')
            if (!from) continue
            const type = msg?.type ?? 'text'
            let body = ''
            if (type === 'text') body = msg?.text?.body ?? ''
            else if (type === 'button') body = msg?.button?.text ?? ''
            else if (type === 'interactive') body = msg?.interactive?.button_reply?.title ?? msg?.interactive?.list_reply?.title ?? ''
            else body = `[${type}]`

            const { error } = await admin.from('wa_messages').insert({
              direction: 'in', wa_phone: from, contact_name: nameByWa[from] || null,
              body, msg_type: type, wa_message_id: msg?.id ?? null, status: 'received',
            })
            // 23505 = duplicate delivery of the same message id; ignore.
            if (error && error.code !== '23505') console.error('inbound insert', error.message)

            if (type === 'text' && STOP_WORDS.has(body.trim().toLowerCase())) {
              await admin.from('wa_opt_outs').upsert({ phone: from, reason: 'replied STOP' }, { onConflict: 'phone' })
            }
          }

          // Delivery/read/failed statuses for replies WE sent from the Inbox.
          for (const st of (value?.statuses ?? [])) {
            if (!st?.id || !st?.status) continue
            await admin.from('wa_messages').update({ status: st.status }).eq('wa_message_id', st.id)
          }
        }
      }
    } catch (e) { console.error('webhook', String(e)) }
    return new Response('ok', { status: 200 })
  }

  return new Response('ok', { status: 200 })
})
