// WhatsApp campaign worker (cron-drained). Sends approved template messages via the
// org's own Meta Cloud API — no third-party platform fees. Throttled per run so volume
// stays gentle; skips opted-out numbers; logs each result. Reads Meta creds from app_settings.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BATCH = 20 // recipients sent per run (cron cadence controls overall pace)

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = createClient(SB_URL, SERVICE)

  // Meta Cloud API config (same number the portal already uses).
  const { data: rows } = await admin.from('app_settings').select('key, value')
    .in('key', ['whatsapp_enabled', 'whatsapp_api_key', 'whatsapp_phone_number_id'])
  const cfg: Record<string, string> = Object.fromEntries((rows ?? []).map((r: any) => [r.key, r.value ?? '']))
  if (cfg.whatsapp_enabled !== 'true') return json({ skipped: 'whatsapp disabled' })
  if (!cfg.whatsapp_api_key || !cfg.whatsapp_phone_number_id) return json({ error: 'meta creds missing' }, 400)

  // One active campaign at a time (oldest first).
  const { data: camp } = await admin.from('wa_campaigns').select('*').eq('status', 'sending')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!camp) return json({ idle: true })

  const { data: recips } = await admin.from('wa_campaign_recipients').select('*')
    .eq('campaign_id', camp.id).eq('status', 'queued').limit(BATCH)
  if (!recips || recips.length === 0) {
    await admin.from('wa_campaigns').update({ status: 'sent' }).eq('id', camp.id)
    return json({ campaign: camp.id, done: true })
  }

  const url = `https://graph.facebook.com/v20.0/${cfg.whatsapp_phone_number_id}/messages`
  let sent = 0, failed = 0, skipped = 0

  for (const r of recips) {
    const phone = String(r.phone ?? '').replace(/\D/g, '')
    // Suppress opted-out or invalid numbers.
    const opted = phone ? (await admin.from('wa_opt_outs').select('phone').eq('phone', phone).maybeSingle()).data : true
    if (!phone || phone.length < 10 || opted) {
      await admin.from('wa_campaign_recipients').update({ status: 'skipped', error: !phone ? 'no phone' : 'opted out / invalid' }).eq('id', r.id)
      skipped++; continue
    }

    const bodyParams: string[] = Array.isArray(r.params) && r.params.length ? r.params : (camp.body_params ?? [])
    const components: any[] = []
    if (camp.header_image_url) components.push({ type: 'header', parameters: [{ type: 'image', image: { link: camp.header_image_url } }] })
    if (bodyParams.length) components.push({ type: 'body', parameters: bodyParams.map((t) => ({ type: 'text', text: (t ?? '').toString().trim() || '—' })) })

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.whatsapp_api_key}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: phone, type: 'template',
          template: { name: camp.template_name, language: { code: camp.language_code || 'en' }, components },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.messages?.[0]?.id) {
        await admin.from('wa_campaign_recipients').update({ status: 'sent', message_id: data.messages[0].id, sent_at: new Date().toISOString(), error: null }).eq('id', r.id)
        sent++
      } else {
        const msg = data?.error?.message ? String(data.error.message).slice(0, 300) : `HTTP ${res.status}`
        await admin.from('wa_campaign_recipients').update({ status: 'failed', error: msg }).eq('id', r.id)
        failed++
      }
    } catch (e) {
      await admin.from('wa_campaign_recipients').update({ status: 'failed', error: String(e).slice(0, 300) }).eq('id', r.id)
      failed++
    }
  }

  // Update campaign counters; mark done if nothing left queued.
  const { count: remaining } = await admin.from('wa_campaign_recipients')
    .select('id', { count: 'exact', head: true }).eq('campaign_id', camp.id).eq('status', 'queued')
  await admin.from('wa_campaigns').update({
    sent: (camp.sent ?? 0) + sent,
    failed: (camp.failed ?? 0) + failed,
    status: (remaining ?? 0) === 0 ? 'sent' : 'sending',
  }).eq('id', camp.id)

  return json({ campaign: camp.id, sent, failed, skipped, remaining: remaining ?? 0 })
})
