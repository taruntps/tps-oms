import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Notification types that warrant a WhatsApp push (not just in-app bell)
const WA_TYPES = ['stage_overdue', 'payment_overdue', 'license_expiring', 'block_request']

// Template mapping: notification type → approved BSP template name + param builder
// Template names must match what you register with your BSP (Interakt/WATI/AiSensy)
const TEMPLATES: Record<string, { name: string; build: (n: Record<string, string>) => string[] }> = {
  stage_overdue:    { name: 'tps_stage_overdue',    build: (n) => [n.title, n.body ?? ''] },
  payment_overdue:  { name: 'tps_payment_overdue',  build: (n) => [n.title, n.body ?? ''] },
  license_expiring: { name: 'tps_license_expiry',   build: (n) => [n.title, n.body ?? ''] },
  block_request:    { name: 'tps_block_request',    build: (n) => [n.title, n.body ?? ''] },
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const sendUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-whatsapp`
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  try {
    // Fetch unread, un-WhatsApp-dispatched notifications for eligible types
    const { data: pending, error } = await supabase
      .from('notifications')
      .select('*, profiles!notifications_user_id_fkey(whatsapp_number, phone)')
      .in('type', WA_TYPES)
      .is('whatsapp_sent_at', null)
      .eq('is_read', false)
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) return json({ error: error.message }, 500)
    if (!pending?.length) return json({ dispatched: 0 })

    const results: { id: string; phone: string; status: string }[] = []

    for (const n of pending) {
      const profile = (n as Record<string, unknown>).profiles as { whatsapp_number?: string; phone?: string } | null
      const rawPhone = profile?.whatsapp_number ?? profile?.phone
      if (!rawPhone) continue

      // Normalise: strip non-digits, ensure 91 prefix
      const phone = rawPhone.replace(/\D/g, '').replace(/^0/, '').replace(/^(?!91)/, '91')

      const tpl = TEMPLATES[n.type]
      if (!tpl) continue

      const res = await fetch(sendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          phone,
          template: tpl.name,
          params: tpl.build(n as Record<string, string>),
          refId: n.id,
        }),
      })

      // Mark dispatched regardless of BSP result so we don't retry spam
      await supabase
        .from('notifications')
        .update({ whatsapp_sent_at: new Date().toISOString() })
        .eq('id', n.id)

      results.push({ id: n.id, phone, status: res.ok ? 'sent' : 'failed' })
    }

    return json({ dispatched: results.length, results })
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
