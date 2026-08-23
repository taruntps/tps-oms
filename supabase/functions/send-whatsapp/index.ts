import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Payload {
  phone: string    // digits with country code, e.g. 919876543210
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

    // Per-employee opt-out: skip if this number belongs to an employee who turned WhatsApp
    // alerts off in User Management. Matched on the last 10 digits of whatsapp_number/phone.
    // (Customer campaign/reply sends go direct to Meta, not through here, so they're unaffected.)
    const last10 = String(phone).replace(/\D/g, '').slice(-10)
    if (last10.length === 10) {
      const { data: pr } = await supabase.from('profiles').select('notify_whatsapp')
        .or(`whatsapp_number.ilike.%${last10},phone.ilike.%${last10}`).limit(1).maybeSingle()
      if (pr && (pr as any).notify_whatsapp === false) {
        return json({ skipped: 'recipient opted out of WhatsApp alerts' })
      }
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
            // Templates were created in English (en) in Meta WhatsApp Manager;
            // en_US fails with error 132001 (template does not exist in en_US).
            language: { code: 'en' },
            components: params.length > 0
              ? [{
                  type: 'body',
                  // Meta rejects any empty text value with error 131008
                  // (missing text value), so never send a blank; fall back to a dash.
                  parameters: params.map(text => ({
                    type: 'text',
                    text: (text ?? '').toString().trim() || '-',
                  })),
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
