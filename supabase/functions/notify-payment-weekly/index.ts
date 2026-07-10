// Supabase Edge Function: notify-payment-weekly
// Cron: Every Monday 09:00 IST (03:30 UTC) — '30 3 * * 1'
// Sends a WhatsApp summary of all clients with pending/partial payments
// to every admin, director, and manager who has a WhatsApp number.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MGR_ROLES = ['super_admin', 'director', 'manager']

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const sendUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-whatsapp`
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  try {
    // Check WhatsApp is enabled
    const { data: settings } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['whatsapp_enabled'])
    const cfg = Object.fromEntries((settings ?? []).map((r: any) => [r.key, r.value]))
    if (cfg.whatsapp_enabled !== 'true') return json({ skipped: 'WhatsApp disabled' })

    // Query active projects with pending/partial payments
    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, project_code, project_name, quoted_amount, paid_amount, payment_status, clients:client_id(company_name)')
      .in('payment_status', ['pending', 'partial'])
      .eq('status', 'active')
      .order('payment_status')

    if (error) return json({ error: error.message }, 500)
    if (!projects?.length) return json({ skipped: 'No pending payments' })

    // Only projects with a REAL positive balance count: a quote must be recorded
    // (quoted_amount > 0) and still be partly unpaid (quoted > paid). This drops
    // un-quoted projects (0/0) and negative balances (a payment logged with no
    // quote yet). paid_amount already excludes govt pass-through fees (mig 062).
    const dueProjects = projects.filter((p: any) =>
      (p.quoted_amount ?? 0) > 0 && (p.quoted_amount ?? 0) > (p.paid_amount ?? 0))
    if (!dueProjects.length) return json({ skipped: 'No outstanding consulting dues' })

    // Build summary
    const count = dueProjects.length
    const totalPaise = dueProjects.reduce((sum: number, p: any) => sum + ((p.quoted_amount ?? 0) - (p.paid_amount ?? 0)), 0)
    const totalRs = Math.round(totalPaise / 100)

    // Client list (max 5 names to keep message short)
    const clientNames = [...new Set(dueProjects.map((p: any) => p.clients?.company_name).filter(Boolean))]
    const clientList = clientNames.slice(0, 5).join(', ') + (clientNames.length > 5 ? ` +${clientNames.length - 5} more` : '')

    // Send to all managers with WhatsApp number
    const { data: managers } = await supabase
      .from('profiles')
      .select('id, name, whatsapp_number, phone')
      .in('role', MGR_ROLES)
      .eq('is_active', true)

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
    const results: { id: string; status: string }[] = []

    for (const mgr of managers ?? []) {
      const rawPhone = mgr.whatsapp_number ?? mgr.phone
      if (!rawPhone) continue

      // Dedup — only once per Monday
      const { data: already } = await supabase
        .from('notification_log')
        .select('id')
        .eq('kind', 'wa_payment_weekly')
        .eq('recipient', mgr.id)
        .eq('for_date', today)
        .maybeSingle()
      if (already) continue

      const phone = rawPhone.replace(/\D/g, '').replace(/^0/, '').replace(/^(?!91)/, '91')

      const res = await fetch(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({
          phone,
          template: 'tps_payment_weekly',
          params: [String(count), String(totalRs), clientList],
          refId: `payment_weekly_${mgr.id}_${today}`,
        }),
      })

      await supabase.from('notification_log').insert({
        kind: 'wa_payment_weekly',
        ref_id: null,
        recipient: mgr.id,
        channel: 'whatsapp',
        for_date: today,
      })

      results.push({ id: mgr.id, status: res.ok ? 'sent' : 'failed' })
    }

    return json({ sent: results.length, count, totalRs, results })
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
