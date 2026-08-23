// Supabase Edge Function: daily-reminders  (ZeptoMail / India DC)
// Cron: 09:00 IST (03:30 UTC). Sends, per active staff member, a digest of their
// OPEN/OVERDUE tasks; and to each manager/director/admin, a digest of licences
// expiring within 30 days. Dedupes via notification_log (one per kind/recipient/day).
// Also sends WhatsApp morning digest via Meta Cloud API (tps_morning_digest template).
//
// Manual test (no staff emailed, nothing logged):
//   POST { 'test': true, 'to': 'tarun@tpsxpert.com', 'name': 'Tarun' }
//
// Secrets: ZEPTOMAIL_TOKEN, MAIL_FROM, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ZEPTO_URL = 'https://api.zeptomail.in/v1.1/email'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM = Deno.env.get('MAIL_FROM') ?? 'noreply@tpsxpert.com'
const RAW = Deno.env.get('ZEPTOMAIL_TOKEN') ?? ''
const AUTH = RAW.startsWith('Zoho-enczapikey') ? RAW : `Zoho-enczapikey ${RAW}`
const MGR_ROLES = ['super_admin', 'director', 'manager']

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!RAW) return j({ ok: false, error: 'ZEPTOMAIL_TOKEN not set' }, 500)

  const supabase = createClient(SUPABASE_URL, SERVICE)
  let opts: any = {}
  try { if (req.method === 'POST') opts = await req.json() } catch { /* */ }
  const testTo: string | null = opts.test ? (opts.to ?? FROM) : null
  const today = todayIST()

  const { data: settings } = await supabase.from('reminder_settings').select('*').eq('id', true).maybeSingle()
  if (!testTo && settings && settings.email_enabled === false) return j({ skipped: 'email disabled' })

  const { data: au } = await supabase.auth.admin.listUsers()
  const emailMap: Record<string, string> = {}
  for (const u of au?.users ?? []) if (u.email) emailMap[u.id] = u.email

  const { data: staff } = await supabase.from('profiles').select('id, name, role, whatsapp_number, phone, notify_email').eq('is_active', true)
  // Per-employee email opt-out (User Management): drop them so no digest email fires.
  // (The WhatsApp morning digest below routes through send-whatsapp, which enforces notify_whatsapp.)
  for (const s of staff ?? []) if ((s as any).notify_email === false) delete emailMap[s.id]

  const { data: tasks } = await supabase.from('tasks')
    .select('id, title, priority, status, due_date, assigned_to, project:projects(project_code), client:clients(company_name)')
    .in('status', ['open', 'in_progress'])
  const tByUser: Record<string, any[]> = {}
  for (const t of tasks ?? []) (tByUser[t.assigned_to] ??= []).push(t)

  const { data: lic } = await supabase.from('licenses')
    .select('id, license_type, license_number, expiry_date, client:clients(company_name)')
    .eq('is_active', true).not('expiry_date', 'is', null).lte('expiry_date', addDays(today, 30)).order('expiry_date')

  // FSSAI query rounds with response due within 5 days or overdue (not yet responded)
  const { data: queries } = await supabase.from('authority_queries')
    .select('id, received_date, response_due, project:projects(project_code, client:clients(company_name))')
    .is('response_submitted_date', null).not('response_due', 'is', null)
    .lte('response_due', addDays(today, 5)).order('response_due')

  const sent: any[] = []

  // ── TEST MODE: one combined email, no logging ──
  if (testTo) {
    const sample = (tasks ?? []).slice(0, 10)
    const html = taskDigestHtml(opts.name ?? 'Tarun', splitDue(sample, today)) + licenceHtml(lic ?? [], today) + queryHtml(queries ?? [], today)
    const ok = await sendMail(testTo, opts.name ?? 'Tarun', `[TPS Xperts Group] Test digest — ${sample.length} task(s), ${(lic ?? []).length} licence(s)`, html)
    return j({ ok, test: true, to: testTo, tasks: sample.length, licences: (lic ?? []).length, queries: (queries ?? []).length })
  }

  // ── Per-staff TASK digests ──
  for (const s of staff ?? []) {
    const mine = tByUser[s.id] ?? []
    if (mine.length === 0) continue
    const email = emailMap[s.id]
    if (!email) continue
    if (await alreadySent(supabase, 'digest', null, s.id, today)) continue
    const { overdue, upcoming } = splitDue(mine, today)
    const ok = await sendMail(email, s.name, `[TPS Xperts Group] Your tasks — ${overdue.length} overdue, ${upcoming.length} open`, taskDigestHtml(s.name, { overdue, upcoming }))
    await logSent(supabase, 'digest', null, s.id)
    sent.push({ uid: s.id, kind: 'task_digest', ok })
  }

  // ── Manager LICENCE digest ──
  if ((lic ?? []).length) {
    const mgrs = (staff ?? []).filter(s => MGR_ROLES.includes(s.role))
    for (const m of mgrs) {
      const email = emailMap[m.id]
      if (!email) continue
      if (await alreadySent(supabase, 'licence_digest', null, m.id, today)) continue
      const ok = await sendMail(email, m.name, `[TPS Xperts Group] ${lic!.length} licence(s) expiring within 30 days`, licenceHtml(lic!, today))
      await logSent(supabase, 'licence_digest', null, m.id)
      sent.push({ uid: m.id, kind: 'licence_digest', ok })
    }
  }

  // ── Manager FSSAI QUERY-DUE digest ──
  if ((queries ?? []).length) {
    const mgrs = (staff ?? []).filter(s => MGR_ROLES.includes(s.role))
    for (const m of mgrs) {
      const email = emailMap[m.id]
      if (!email) continue
      if (await alreadySent(supabase, 'query_digest', null, m.id, today)) continue
      const ok = await sendMail(email, m.name, `[TPS Xperts Group] ${queries!.length} FSSAI query response(s) due`, queryHtml(queries!, today))
      await logSent(supabase, 'query_digest', null, m.id)
      sent.push({ uid: m.id, kind: 'query_digest', ok })
    }
  }

  // ── WhatsApp morning digest (tps_morning_digest) ──
  const waEnabled = settings?.whatsapp_enabled === true || settings?.whatsapp_enabled === 'true'
  if (!testTo && waEnabled) {
    const sendUrl = `${SUPABASE_URL}/functions/v1/send-whatsapp`

    // Per-user stage rows (both statuses — we split them below).
    // !inner + eq on projects.status limits to stages of ACTIVE projects only —
    // cancelled/completed/on-hold projects must not count as someone's pending
    // work (this is what was inflating the counts).
    const { data: stageRows } = await supabase
      .from('stages')
      .select('assigned_to, status, due_date, projects!inner(status)')
      .eq('projects.status', 'active')
      .in('status', ['pending', 'in_progress'])

    // Per-user project rows (active, NOT blocked) — a project is 'mine' if I'm
    // the assignee OR the manager. Excluding blocked matches the Projects page
    // Active tab (blocked projects live under the Blocked tab, clock stopped).
    const { data: projRows } = await supabase
      .from('projects')
      .select('assigned_to, manager_id, is_blocked')
      .eq('status', 'active')

    for (const s of staff ?? []) {
      const phone = (s as any).whatsapp_number
      if (!phone) continue
      // The morning digest is a personal work reminder for people who do project
      // work. Admins (super_admin/director) oversee everything via the Dashboard,
      // so a 'your pending work' digest is just the whole company — skip them.
      if (['super_admin', 'director'].includes(s.role)) continue
      if (await alreadySent(supabase, 'wa_morning_digest', null, s.id, today)) continue

      const myStages = (stageRows ?? []).filter((r: any) => r.assigned_to === s.id)
      // 'Pending stages' = stages actively in this person's hands (in_progress).
      // Not-yet-started future stages (status 'pending') are queued backlog, not
      // today's work, so they're excluded from the headline number.
      const pending  = myStages.filter((r: any) => r.status === 'in_progress').length
      // Overdue = any incomplete stage of theirs past its due date (urgent flag).
      const overdue  = myStages.filter((r: any) => r.due_date && r.due_date < today).length
      // Their own active, non-blocked projects (assignee or manager).
      const myProjects = (projRows ?? []).filter((r: any) => (r.assigned_to === s.id || r.manager_id === s.id) && !r.is_blocked).length

      if (pending === 0 && overdue === 0 && myProjects === 0) continue

      const normalised = phone.replace(/\D/g, '').replace(/^0/, '').replace(/^(?!91)/, '91')
      await fetch(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE}` },
        body: JSON.stringify({
          phone: normalised,
          template: 'tps_morning_digest',
          params: [s.name, String(pending), String(overdue), String(myProjects)],
          refId: `morning_${s.id}_${today}`,
        }),
      })
      await logSent(supabase, 'wa_morning_digest', null, s.id)
      sent.push({ uid: s.id, kind: 'wa_morning_digest' })
    }
  }

  return j({ ok: true, sent: sent.length, results: sent })
})

// ── helpers ──
async function sendMail(to: string, name: string, subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch(ZEPTO_URL, {
      method: 'POST',
      headers: { 'Authorization': AUTH, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ from: { address: FROM, name: 'TPS Xperts Group' }, to: [{ email_address: { address: to, name: name || to } }], subject, htmlbody: html }),
    })
    return res.ok
  } catch { return false }
}
async function alreadySent(sb: any, kind: string, ref: string | null, recipient: string, today: string) {
  const q = sb.from('notification_log').select('id').eq('kind', kind).eq('recipient', recipient).eq('for_date', today)
  const { data } = ref ? await q.eq('ref_id', ref).maybeSingle() : await q.is('ref_id', null).maybeSingle()
  return !!data
}
async function logSent(sb: any, kind: string, ref: string | null, recipient: string) {
  await sb.from('notification_log').insert({ kind, ref_id: ref, recipient, channel: 'email' })
}
function todayIST() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
function addDays(iso: string, n: number) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
function splitDue(items: any[], today: string) {
  return { overdue: items.filter(t => t.due_date && t.due_date < today), upcoming: items.filter(t => !(t.due_date && t.due_date < today)) }
}
function esc(s: any) { return String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!)) }
function taskRows(items: any[], overdue: boolean) {
  return items.map(t => `<tr>
    <td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;font-weight:600;color:#1E3A5F;'>${esc(t.title)}</td>
    <td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#6B7280;'>${esc(t.project?.project_code ?? t.client?.company_name ?? '—')}</td>
    <td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#6B7280;text-transform:capitalize;'>${esc(t.priority)}</td>
    <td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;color:${overdue ? '#DC2626' : '#374151'};'>${t.due_date ?? 'No date'}${overdue ? ' ⚠️' : ''}</td>
  </tr>`).join('')
}
function taskTable(title: string, color: string, bg: string, rows: string) {
  return `<h3 style='color:${color};margin:20px 0 8px;'>${title}</h3>
  <table width='100%' cellpadding='0' cellspacing='0' style='border-collapse:collapse;background:#fff;border:1px solid ${bg};border-radius:8px;overflow:hidden;'>
    <thead><tr style='background:${bg};'><th style='padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:${color};'>Task</th><th style='padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:${color};'>Ref</th><th style='padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:${color};'>Priority</th><th style='padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:${color};'>Due</th></tr></thead>
    <tbody>${rows}</tbody></table>`
}
function brandHeader(subtitle: string) {
  return `<tr><td style='background:#1E3A5F;border-radius:12px 12px 0 0;padding:18px 28px;'>
  <table cellpadding='0' cellspacing='0'><tr>
  <td style='padding-right:12px;'><table cellpadding='0' cellspacing='0'><tr><td style='width:42px;height:42px;background:#ffffff;border-radius:10px;text-align:center;vertical-align:middle;'><img src='https://portal.tpsxpert.com/logo.png' width='34' height='34' alt='TPS' style='display:inline-block;vertical-align:middle;' /></td></tr></table></td>
  <td style='vertical-align:middle;'><span style='color:#ffffff;font-size:18px;font-weight:bold;'>TPS Xperts Group</span>${subtitle ? `<br><span style='color:#93C5FD;font-size:12px;'>${subtitle}</span>` : ''}</td>
  </tr></table></td></tr>`
}
function shell(name: string, intro: string, body: string) {
  return `<!DOCTYPE html><html><body style='margin:0;background:#F3F4F6;font-family:Arial,sans-serif;'>
  <table width='100%' cellpadding='0' cellspacing='0'><tr><td align='center' style='padding:28px 16px;'>
  <table width='600' cellpadding='0' cellspacing='0' style='max-width:600px;'>
  ${brandHeader('Daily Summary')}
  <tr><td style='background:#fff;border-radius:0 0 12px 12px;padding:24px 30px;'>
  <p style='color:#374151;margin:0 0 6px;'>Dear <strong>${esc(name)}</strong>,</p><p style='color:#374151;margin:0 0 4px;'>${intro}</p>${body}
  <p style='margin:28px 0 0;padding-top:14px;border-top:1px solid #f0f0f0;color:#9CA3AF;font-size:12px;'>Automated message from TPS Xperts Group · <a href='https://portal.tpsxpert.com' style='color:#1E3A5F;'>portal.tpsxpert.com</a></p>
  </td></tr></table></td></tr></table></body></html>`
}
function taskDigestHtml(name: string, d: { overdue: any[]; upcoming: any[] }) {
  const body = (d.overdue.length ? taskTable(`⚠️ Overdue (${d.overdue.length})`, '#DC2626', '#FEF2F2', taskRows(d.overdue, true)) : '')
    + (d.upcoming.length ? taskTable(`📋 Open (${d.upcoming.length})`, '#1E3A8A', '#EFF6FF', taskRows(d.upcoming, false)) : '')
    + (!d.overdue.length && !d.upcoming.length ? `<p style='color:#6B7280;'>No open tasks. 🎉</p>` : '')
  return shell(name, `You have <strong>${d.overdue.length + d.upcoming.length}</strong> open task(s).`, body)
}
function licenceHtml(lic: any[], today: string) {
  if (!lic.length) return ''
  const rows = lic.map(l => {
    const exp = l.expiry_date as string
    const expired = exp < today
    return `<tr>
      <td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#374151;'>${esc(l.client?.company_name ?? '—')}</td>
      <td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#374151;'>${esc(l.license_type)}${l.license_number ? ' · ' + esc(l.license_number) : ''}</td>
      <td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;color:${expired ? '#DC2626' : '#B45309'};'>${exp}${expired ? ' (expired)' : ''}</td>
    </tr>`
  }).join('')
  return `<h3 style='color:#B45309;margin:20px 0 8px;'>📜 Licences expiring (${lic.length})</h3>
  <table width='100%' cellpadding='0' cellspacing='0' style='border-collapse:collapse;background:#fff;border:1px solid #FDE68A;border-radius:8px;overflow:hidden;'>
  <thead><tr style='background:#FFFBEB;'><th style='padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#92400E;'>Client</th><th style='padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#92400E;'>Licence</th><th style='padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#92400E;'>Expiry</th></tr></thead>
  <tbody>${rows}</tbody></table>`
}
function queryHtml(qs: any[], today: string) {
  if (!qs.length) return ''
  const rows = qs.map(q => {
    const due = q.response_due as string
    const overdue = due < today
    return `<tr>
      <td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#374151;'>${esc(q.project?.client?.company_name ?? '—')}</td>
      <td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#374151;'>${esc(q.project?.project_code ?? '—')}</td>
      <td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#6B7280;'>${q.received_date}</td>
      <td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;color:${overdue ? '#DC2626' : '#B45309'};'>${due}${overdue ? ' (overdue)' : ''}</td>
    </tr>`
  }).join('')
  return `<h3 style='color:#B45309;margin:20px 0 8px;'>⏳ FSSAI query responses due (${qs.length})</h3>
  <table width='100%' cellpadding='0' cellspacing='0' style='border-collapse:collapse;background:#fff;border:1px solid #FDE68A;border-radius:8px;overflow:hidden;'>
  <thead><tr style='background:#FFFBEB;'><th style='padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#92400E;'>Client</th><th style='padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#92400E;'>Project</th><th style='padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#92400E;'>Received</th><th style='padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#92400E;'>Response due</th></tr></thead>
  <tbody>${rows}</tbody></table>`
}
function j(b: unknown, status = 200) { return new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } }) }
