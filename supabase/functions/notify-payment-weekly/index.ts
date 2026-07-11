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

    // Active AND completed projects with pending/partial payments. Completed =
    // work delivered, money owed — the highest-priority dues to collect.
    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, project_code, project_name, status, quoted_amount, paid_amount, payment_status, clients:client_id(company_name)')
      .in('payment_status', ['pending', 'partial'])
      .in('status', ['active', 'completed'])
      .order('payment_status')

    if (error) return json({ error: error.message }, 500)
    if (!projects?.length) return json({ skipped: 'No pending payments' })

    // Projects with a REAL positive balance (quote recorded + still unpaid) drive
    // the rupee TOTAL. paid_amount already excludes govt fees (migration 062).
    const due = (p: any) => (p.quoted_amount ?? 0) > 0 && (p.quoted_amount ?? 0) > (p.paid_amount ?? 0)
    const dueProjects  = projects.filter(due)
    const completedDue = dueProjects.filter((p: any) => p.status === 'completed')
    const sumRs = (list: any[]) => Math.round(list.reduce((s, p) => s + ((p.quoted_amount ?? 0) - (p.paid_amount ?? 0)), 0) / 100)
    const totalRs     = sumRs(dueProjects)
    const completedRs = sumRs(completedDue)

    // Client NAMES + count include EVERY pending client (even those without a
    // quote yet). Order: clients with a real due first (priority), then the rest.
    const nameOf   = (p: any) => p.clients?.company_name
    const dueNames = [...new Set(dueProjects.map(nameOf).filter(Boolean))]
    const allNames = [...new Set(projects.map(nameOf).filter(Boolean))]
    const restNames = allNames.filter((n: string) => !dueNames.includes(n))
    const ordered  = [...dueNames, ...restNames]     // all distinct pending clients
    const count    = ordered.length                  // every pending client

    // Trim legal suffixes so ALL names fit within WhatsApp's ~1024-char limit.
    const shorten = (n: string) =>
      n.replace(/[.,]?\s*(private\s+limited|pvt\.?\s*ltd\.?|limited|llp|enterprises?)\.?\s*$/i, '').trim()
    // Add names until the length budget is hit, then "+N more (see portal)".
    const prefix = completedRs > 0 ? `Rs.${completedRs} on completed (PRIORITY). ` : ''
    const LIMIT = 900 - prefix.length
    const picked: string[] = []
    let used = 0
    for (const full of ordered) {
      const s = shorten(full)
      if (used + s.length + 2 > LIMIT) break
      picked.push(s); used += s.length + 2
    }
    const remaining = ordered.length - picked.length
    const listStr = picked.join(', ') + (remaining > 0 ? ` +${remaining} more (see portal)` : '')
    const clientList = prefix + listStr

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
