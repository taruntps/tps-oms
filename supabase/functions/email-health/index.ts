// Supabase Edge Function: email-health
// Daily synthetic check that the ZeptoMail path can actually send. On failure
// (e.g. credit exhausted -> HTTP 429) it raises an in-app admin alert via
// raise_email_failure_alert(). Sends one self-addressed probe to MAIL_FROM so it
// never spams staff. Cron: daily (see cron.job 'email-health-check').
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ZEPTO_URL = 'https://api.zeptomail.in/v1.1/email'
const RAW = Deno.env.get('ZEPTOMAIL_TOKEN') ?? ''
const FROM = Deno.env.get('MAIL_FROM') ?? 'noreply@tpsxpert.com'
const AUTH = RAW.startsWith('Zoho-enczapikey') ? RAW : `Zoho-enczapikey ${RAW}`
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

function json(b: unknown) { return new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } }) }

serve(async () => {
  if (!RAW) {
    await admin.rpc('raise_email_failure_alert', { p_detail: 'ZEPTOMAIL_TOKEN not set' })
    return json({ ok: false, error: 'no token' })
  }
  try {
    const res = await fetch(ZEPTO_URL, {
      method: 'POST',
      headers: { 'Authorization': AUTH, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        from: { address: FROM, name: 'TPS OMS Health' },
        to: [{ email_address: { address: FROM, name: 'Health' } }],
        subject: 'TPS OMS email health check',
        htmlbody: '<p>Automated email deliverability check. No action needed.</p>',
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      await admin.rpc('raise_email_failure_alert', { p_detail: 'HTTP ' + res.status })
      return json({ ok: false, status: res.status, zepto: body.slice(0, 300) })
    }
    return json({ ok: true, status: res.status })
  } catch (e) {
    await admin.rpc('raise_email_failure_alert', { p_detail: String(e).slice(0, 120) })
    return json({ ok: false, error: String(e) })
  }
})
