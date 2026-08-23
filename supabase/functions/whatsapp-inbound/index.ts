// WhatsApp inbound webhook. Meta calls this for every reply to the campaign number and for
// delivery/read statuses. Stores inbound messages in wa_messages (shown in the portal Inbox),
// auto-adds STOP repliers to wa_opt_outs, and fires new-reply alerts to the team (email now;
// WhatsApp/SMS once the notify_reply_* settings are filled). verify_jwt is OFF - Meta calls it
// with no Supabase JWT; the GET handshake is guarded by our own verify token.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const STOP_WORDS = new Set(['stop', 'unsubscribe', 'stop promotions', 'stop all', 'unsubscribe me'])

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Alert the team about a new customer reply. Throttled per sender so a burst gives one alert.
// Channels are read live from app_settings (empty value = that channel off).
async function alertNewReply(admin: any, waPhone: string, name: string | null, body: string) {
  const { data: rows } = await admin.from('app_settings').select('key, value')
    .in('key', ['notify_reply_email', 'notify_reply_wa', 'notify_reply_sms', 'notify_reply_wa_template', 'notify_reply_throttle_min'])
  const cfg: Record<string, string> = Object.fromEntries((rows ?? []).map((r: any) => [r.key, r.value ?? '']))
  const throttleMin = parseInt(cfg.notify_reply_throttle_min || '10', 10)

  // Suppress if we already recorded an inbound from this number within the window.
  const since = new Date(Date.now() - throttleMin * 60000).toISOString()
  const { count } = await admin.from('wa_messages').select('id', { count: 'exact', head: true })
    .eq('wa_phone', waPhone).eq('direction', 'in').gte('created_at', since)
  if ((count ?? 0) > 1) return

  const who = name ? name + ' (+' + waPhone + ')' : '+' + waPhone
  const preview = (body || '').replace(/\s+/g, ' ').trim().slice(0, 140) || '(no text)'

  // Email (ZeptoMail India) - active as soon as notify_reply_email is set.
  if (cfg.notify_reply_email) {
    try {
      const rawToken = Deno.env.get('ZEPTOMAIL_TOKEN') ?? ''
      const from = Deno.env.get('MAIL_FROM') ?? 'noreply@tpsxpert.com'
      if (rawToken) {
        const auth = rawToken.startsWith('Zoho-enczapikey') ? rawToken : 'Zoho-enczapikey ' + rawToken
        const html = `<div style='font-family:Arial,sans-serif;color:#1E3A5F'><h3>New WhatsApp reply</h3><p><b>From:</b> ${esc(who)}</p><p><b>Message:</b> ${esc(preview)}</p><p><a href='https://portal.tpsxpert.com/marketing/whatsapp-inbox'>Open the WhatsApp Inbox to reply</a></p></div>`
        await fetch('https://api.zeptomail.in/v1.1/email', {
          method: 'POST',
          headers: { 'Authorization': auth, 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            from: { address: from, name: 'TPS Xperts OMS' },
            to: [{ email_address: { address: cfg.notify_reply_email, name: 'TPS Team' } }],
            subject: '🔔 New WhatsApp reply from ' + who,
            htmlbody: html,
          }),
        })
      }
    } catch (e) { console.error('alert email', String(e)) }
  }

  // WhatsApp - active once notify_reply_wa is set AND tps_new_reply is approved.
  if (cfg.notify_reply_wa && cfg.notify_reply_wa_template) {
    try {
      await fetch(SB_URL + '/functions/v1/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SERVICE },
        body: JSON.stringify({ phone: cfg.notify_reply_wa.replace(/\D/g, ''), template: cfg.notify_reply_wa_template, params: [who, preview] }),
      })
    } catch (e) { console.error('alert wa', String(e)) }
  }

  // SMS - wired for when notify_reply_sms + a 2Factor DLT template are ready (added later).
}

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

  // 2) Event delivery (Meta POST). Always answer 200 so Meta does not retry-storm.
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
            else body = '[' + type + ']'

            const nm = nameByWa[from] || null
            const { error } = await admin.from('wa_messages').insert({
              direction: 'in', wa_phone: from, contact_name: nm,
              body, msg_type: type, wa_message_id: msg?.id ?? null, status: 'received',
            })
            // 23505 = duplicate delivery of the same message id; ignore + do not re-alert.
            if (error && error.code !== '23505') console.error('inbound insert', error.message)

            if (type === 'text' && STOP_WORDS.has(body.trim().toLowerCase())) {
              await admin.from('wa_opt_outs').upsert({ phone: from, reason: 'replied STOP' }, { onConflict: 'phone' })
            }

            // Alert the team on a genuinely new insert (throttled). Never block the 200.
            if (!error) {
              try { await alertNewReply(admin, from, nm, body) } catch (e) { console.error('alert', String(e)) }
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
