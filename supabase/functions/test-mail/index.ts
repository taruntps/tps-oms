// Supabase Edge Function: test-mail
// One-shot ZeptoMail (India DC) send to prove the email path works end-to-end
// before we wire the full reminder engine. Safe to delete after verification.
//
// Reads secrets:  ZEPTOMAIL_TOKEN  (the Send-Mail token, with or without the
//                                   "Zoho-enczapikey " prefix)
//                 MAIL_FROM        (verified sender, e.g. noreply@tpsxpert.com)
// Body (POST):    { "to": "someone@tpsxpert.com", "name": "Tarun" }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ZEPTO_URL = 'https://api.zeptomail.in/v1.1/email'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const rawToken = Deno.env.get('ZEPTOMAIL_TOKEN') ?? ''
  const from     = Deno.env.get('MAIL_FROM') ?? 'noreply@tpsxpert.com'
  if (!rawToken) return json({ ok: false, error: 'ZEPTOMAIL_TOKEN secret not set' }, 500)

  const auth = rawToken.startsWith('Zoho-enczapikey') ? rawToken : `Zoho-enczapikey ${rawToken}`

  let to = 'tarun@tpsxpert.com', name = 'Tarun'
  try {
    if (req.method === 'POST') {
      const b = await req.json()
      if (b.to) to = b.to
      if (b.name) name = b.name
    }
  } catch { /* use defaults */ }

  try {
    const res = await fetch(ZEPTO_URL, {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        from: { address: from, name: 'TPS Xperts OMS' },
        to: [{ email_address: { address: to, name } }],
        subject: 'TPS OMS — email test ✅',
        htmlbody: `<div style="font-family:Arial,sans-serif;color:#1E3A5F;">
          <h2>TPS Xperts OMS email is working</h2>
          <p>Hi ${name}, this confirms ZeptoMail (India) is sending from <b>${from}</b>.</p>
          <p>Reminders will use this same path.</p></div>`,
      }),
    })
    const body = await res.text()
    return json({ ok: res.ok, status: res.status, zepto: safeParse(body), from, to })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
function safeParse(s: string) { try { return JSON.parse(s) } catch { return s } }
