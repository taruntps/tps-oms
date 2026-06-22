import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Payload {
  phone: string       // digits only with country code: "919876543210"
  template: string    // pre-approved template name in your BSP account
  params: string[]    // ordered body variable values
  refId?: string      // optional tracking ID
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { phone, template, params, refId }: Payload = await req.json()

    // Read BSP config
    const { data: rows } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['whatsapp_enabled', 'whatsapp_bsp', 'whatsapp_api_key', 'whatsapp_wati_url'])

    const cfg: Record<string, string> = Object.fromEntries(
      (rows ?? []).map((r) => [r.key, r.value ?? ''])
    )

    if (cfg.whatsapp_enabled !== 'true') {
      return json({ skipped: 'WhatsApp notifications are disabled' })
    }
    if (!cfg.whatsapp_api_key) {
      return json({ error: 'BSP API key not configured in Settings' }, 400)
    }

    const bsp = cfg.whatsapp_bsp || 'interakt'
    const apiKey = cfg.whatsapp_api_key
    let bspRes: Response

    if (bsp === 'interakt') {
      bspRes = await fetch('https://api.interakt.ai/v1/public/message/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + btoa(apiKey),
        },
        body: JSON.stringify({
          countryCode: '+91',
          phoneNumber: phone.replace(/^91/, ''),
          callbackData: refId ?? template,
          type: 'Template',
          template: { name: template, languageCode: 'en', bodyValues: params },
        }),
      })
    } else if (bsp === 'wati') {
      const base = (cfg.whatsapp_wati_url || '').replace(/\/$/, '')
      if (!base) return json({ error: 'WATI server URL not configured' }, 400)
      bspRes = await fetch(`${base}/api/v1/sendTemplateMessage?whatsappNumber=${phone}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          template_name: template,
          broadcast_name: refId ?? template,
          parameters: params.map((v, i) => ({ name: `param${i + 1}`, value: v })),
        }),
      })
    } else if (bsp === 'aisensy') {
      bspRes = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          campaignName: template,
          destination: phone,
          userName: 'TPS Xperts',
          templateParams: params,
          source: 'tps-oms',
          media: {},
          buttons: [],
          carouselCards: [],
          location: {},
          paramsFallbackValue: {},
        }),
      })
    } else {
      return json({ error: `Unknown BSP: ${bsp}` }, 400)
    }

    const data = await bspRes.json().catch(() => ({}))
    const ok = bspRes.ok

    await supabase.from('whatsapp_log').insert({
      phone, template, params, ref_id: refId, bsp,
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
