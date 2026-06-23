// Supabase Edge Function: daily-reminders
// Runs on a cron schedule (set in Supabase dashboard: 0 8 * * * → 8:00 AM IST)
// Sends email (via Resend) + WhatsApp (via AiSensy) to each employee
// with their assigned pending stages and overdue items.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const RESEND_API_KEY      = Deno.env.get('RESEND_API_KEY')!
const AISENSY_API_KEY     = Deno.env.get('AISENSY_API_KEY') ?? ''
const AISENSY_CAMPAIGN    = Deno.env.get('AISENSY_DAILY_CAMPAIGN') ?? 'tps_daily_reminder'
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY= Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL          = 'noreply@tpsxpert.com'

serve(async (req) => {
  // Allow manual trigger via POST with Authorization header
  const isManual = req.method === 'POST'

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Fetch all active staff with email + whatsapp
  const { data: staff, error: staffErr } = await supabase
    .from('profiles')
    .select('id, name, phone, whatsapp_number')
    .eq('is_active', true)

  if (staffErr) {
    console.error('Failed to fetch staff', staffErr.message)
    return new Response(JSON.stringify({ error: staffErr.message }), { status: 500 })
  }

  // Fetch auth emails for staff (need service role)
  const { data: authUsers } = await supabase.auth.admin.listUsers()
  const emailMap: Record<string, string> = {}
  for (const u of authUsers?.users ?? []) {
    if (u.email) emailMap[u.id] = u.email
  }

  // Fetch all pending/in-progress stages with project + client info
  const { data: stages, error: stagesErr } = await supabase
    .from('stages')
    .select(`
      id, stage_name, clock_status, target_date, is_overdue,
      project:projects!stages_project_id_fkey(
        id, project_code, project_name, service_type,
        assigned_to, manager_id,
        client:clients!projects_client_id_fkey(company_name)
      )
    `)
    .in('clock_status', ['employee', 'awaiting_client'])
    .eq('is_completed', false)
    .eq('is_skipped', false)
    .not('project', 'is', null)

  if (stagesErr) {
    console.error('Failed to fetch stages', stagesErr.message)
  }

  const stageList = (stages ?? []) as any[]

  // Group stages by assigned_to
  const byEmployee: Record<string, { name: string; email: string; wa: string; items: any[] }> = {}

  for (const s of stageList) {
    const p = s.project
    if (!p) continue
    const assignees = [p.assigned_to, p.manager_id].filter(Boolean)
    for (const uid of assignees) {
      const profile = staff?.find(x => x.id === uid)
      if (!profile) continue
      if (!byEmployee[uid]) {
        byEmployee[uid] = {
          name:  profile.name,
          email: emailMap[uid] ?? '',
          wa:    profile.whatsapp_number ?? '',
          items: [],
        }
      }
      byEmployee[uid].items.push({
        project_code: p.project_code,
        project_name: p.project_name,
        client:       p.client?.company_name ?? 'N/A',
        service_type: p.service_type,
        stage_name:   s.stage_name,
        clock_status: s.clock_status,
        target_date:  s.target_date,
        is_overdue:   s.is_overdue,
      })
    }
  }

  const results: any[] = []

  for (const [uid, emp] of Object.entries(byEmployee)) {
    if (!emp.items.length) continue

    // Build email
    const overdue  = emp.items.filter(i => i.is_overdue)
    const pending  = emp.items.filter(i => !i.is_overdue)
    const emailHtml = buildEmailHtml(emp.name, overdue, pending)

    // Send email via Resend
    if (emp.email) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `TPS Xperts OMS <${FROM_EMAIL}>`,
            to:   [emp.email],
            subject: `[TPS OMS] Daily Task Summary — ${emp.items.length} pending item${emp.items.length > 1 ? 's' : ''}`,
            html: emailHtml,
          }),
        })
        const json = await res.json()
        console.log(`Email to ${emp.email}:`, json.id ?? json.error)
        results.push({ uid, channel: 'email', status: res.ok ? 'sent' : 'failed' })
      } catch (e: any) {
        console.error('Email error', e.message)
        results.push({ uid, channel: 'email', status: 'error', error: e.message })
      }
    }

    // Send WhatsApp via AiSensy (when API key is available)
    if (AISENSY_API_KEY && emp.wa) {
      try {
        // AiSensy template message — uses approved template
        const waBody = buildWaMessage(emp.name, emp.items)
        const res = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
          method: 'POST',
          headers: {
            'X-AiSensy-Project-API-Pwd': AISENSY_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            apiKey:            AISENSY_API_KEY,
            campaignName:      AISENSY_CAMPAIGN,
            destination:       emp.wa,
            userName:          emp.name,
            templateParams:    [emp.name, String(emp.items.length), waBody],
            source:            'TPS_OMS_DAILY',
            media:             {},
            buttons:           [],
            carouselCards:     [],
            location:          {},
          }),
        })
        console.log(`WhatsApp to ${emp.wa}:`, res.status)
        results.push({ uid, channel: 'whatsapp', status: res.ok ? 'sent' : 'failed' })
      } catch (e: any) {
        console.error('WhatsApp error', e.message)
        results.push({ uid, channel: 'whatsapp', status: 'error', error: e.message })
      }
    }
  }

  return new Response(
    JSON.stringify({ sent: results.length, results, manual: isManual }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildEmailHtml(name: string, overdue: any[], pending: any[]): string {
  const tableRows = (items: any[], isOverdue: boolean) =>
    items.map(i => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-weight:600;color:#1E3A5F;">${i.project_code}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#374151;">${i.client}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#374151;">${i.project_name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#374151;">${i.stage_name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:${isOverdue ? '#DC2626' : '#374151'};">
          ${i.target_date ?? 'No date'}${isOverdue ? ' ⚠️' : ''}
        </td>
      </tr>`).join('')

  const overdueSection = overdue.length ? `
    <h3 style="color:#DC2626;margin:24px 0 8px;">⚠️ Overdue (${overdue.length})</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fff;border:1px solid #FCA5A5;border-radius:8px;overflow:hidden;">
      <thead><tr style="background:#FEF2F2;">
        <th style="padding:10px 12px;text-align:left;color:#7F1D1D;font-size:11px;text-transform:uppercase;">Code</th>
        <th style="padding:10px 12px;text-align:left;color:#7F1D1D;font-size:11px;text-transform:uppercase;">Client</th>
        <th style="padding:10px 12px;text-align:left;color:#7F1D1D;font-size:11px;text-transform:uppercase;">Project</th>
        <th style="padding:10px 12px;text-align:left;color:#7F1D1D;font-size:11px;text-transform:uppercase;">Stage</th>
        <th style="padding:10px 12px;text-align:left;color:#7F1D1D;font-size:11px;text-transform:uppercase;">Target</th>
      </tr></thead>
      <tbody>${tableRows(overdue, true)}</tbody>
    </table>` : ''

  const pendingSection = pending.length ? `
    <h3 style="color:#1E3A5F;margin:24px 0 8px;">📋 Pending (${pending.length})</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fff;border:1px solid #DBEAFE;border-radius:8px;overflow:hidden;">
      <thead><tr style="background:#EFF6FF;">
        <th style="padding:10px 12px;text-align:left;color:#1E3A8A;font-size:11px;text-transform:uppercase;">Code</th>
        <th style="padding:10px 12px;text-align:left;color:#1E3A8A;font-size:11px;text-transform:uppercase;">Client</th>
        <th style="padding:10px 12px;text-align:left;color:#1E3A8A;font-size:11px;text-transform:uppercase;">Project</th>
        <th style="padding:10px 12px;text-align:left;color:#1E3A8A;font-size:11px;text-transform:uppercase;">Stage</th>
        <th style="padding:10px 12px;text-align:left;color:#1E3A8A;font-size:11px;text-transform:uppercase;">Target</th>
      </tr></thead>
      <tbody>${tableRows(pending, false)}</tbody>
    </table>` : ''

  return `
<!DOCTYPE html><html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;">
        <!-- Header -->
        <tr><td style="background:#1E3A5F;border-radius:12px 12px 0 0;padding:24px 32px;">
          <h1 style="color:#fff;margin:0;font-size:20px;">TPS Xperts OMS</h1>
          <p style="color:#93C5FD;margin:4px 0 0;font-size:13px;">Daily Task Summary</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="background:#fff;border-radius:0 0 12px 12px;padding:24px 32px;">
          <p style="color:#374151;margin:0 0 16px;">Hi <strong>${name}</strong>,</p>
          <p style="color:#374151;margin:0 0 8px;">Here is your task summary for today. You have <strong>${overdue.length + pending.length} item(s)</strong> requiring attention.</p>
          ${overdueSection}
          ${pendingSection}
          <p style="margin:32px 0 0;padding-top:16px;border-top:1px solid #f0f0f0;color:#9CA3AF;font-size:12px;">
            This is an automated reminder from TPS Xperts OMS. Log in at <a href="https://portal.tpsxpert.com" style="color:#1E3A5F;">portal.tpsxpert.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function buildWaMessage(name: string, items: any[]): string {
  const overdue = items.filter(i => i.is_overdue)
  const lines = items.slice(0, 5).map(i =>
    `• ${i.project_code} | ${i.client} | ${i.stage_name}${i.is_overdue ? ' ⚠️' : ''}`
  )
  if (items.length > 5) lines.push(`...and ${items.length - 5} more items`)
  const msg = lines.join('\n')
  if (overdue.length) {
    return `⚠️ ${overdue.length} overdue!\n${msg}\n\nLog in: portal.tpsxpert.com`
  }
  return `${msg}\n\nLog in: portal.tpsxpert.com`
}
