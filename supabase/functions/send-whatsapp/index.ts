import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Payload {
  phone: string    // digits with country code, e.g. "919876543210"
  template: string // pre-approved Meta template name
  params: string[] // ordered body variable values
  refId?: string   // optional tracking ID
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { phone, template, params, refId }: Payload = await req.json()

    // Read Meta config from app_settings
    const { data: rows } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['whatsapp_enabled', 'whatsapp_api_key', 'whatsapp_phone_number_id'])

    const cfg: Record<string, string> = Object.fromEntries(
      (rows ?? []).map((r) => [r.key, r.value ?? ''])
    )

    if (cfg.whatsapp_enabled !== 'true') {
      return json({ skipped: 'WhatsApp notifications are disabled' })
    }
    if (!cfg.whatsapp_api_key) {
      return json({ error: 'Meta access token not configured in Settings' }, 400)
    }
    if (!cfg.whatsapp_phone_number_id) {
      return json({ error: 'Meta Phone Number ID not configured in Settings' }, 400)
    }

    const phoneNumberId = cfg.whatsapp_phone_number_id
    const accessToken   = cfg.whatsapp_api_key

    // Meta Cloud API — send template message
    const metaRes = await fetch(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: {
            name: template,
            language: { code: 'en_US' },
            components: params.length > 0
              ? [{
                  type: 'body',
                  parameters: params.map(text => ({ type: 'text', text })),
                }]
              : [],
          },
        }),
      }
    )

    const data = await metaRes.json().catch(() => ({}))
    const ok   = metaRes.ok

    await supabase.from('whatsapp_log').insert({
      phone,
      template,
      params,
      ref_id: refId,
      bsp: 'meta',
      status: ok ? 'sent' : 'failed',
      response: data,
    })

    return json({ success: ok, data }, ok ? 200 : 502)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
