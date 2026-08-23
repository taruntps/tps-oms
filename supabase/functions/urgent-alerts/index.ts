// Supabase Edge Function: urgent-alerts  (ZeptoMail / India DC)
// Cron: hourly. Emails (deduped once-ever per ref+recipient) only the alerts that have
// NO other channel: completed tasks, and task-extension requests / decisions.
// New task / new project / approvals now fire instantly on bell + WhatsApp + email via
// notify-dispatch; licences are handled by the daily digest.
//
// Manual test (no real emails, no logging):  POST { 'test': true, 'to': '...', 'name': '...' }
// Secrets: ZEPTOMAIL_TOKEN, MAIL_FROM, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ZEPTO_URL = 'https://api.zeptomail.in/v1.1/email'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM = Deno.env.get('MAIL_FROM') ?? 'noreply@tpsxpert.com'
const RAW = Deno.env.get('ZEPTOMAIL_TOKEN') ?? ''
const AUTH = RAW.startsWith('Zoho-enczapikey') ? RAW : `Zoho-enczapikey ${RAW}`
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!RAW) return j({ ok: false, error: 'ZEPTOMAIL_TOKEN not set' }, 500)

  const supabase = createClient(SUPABASE_URL, SERVICE)
  let opts: any = {}
  try { if (req.method === 'POST') opts = await req.json() } catch { /* */ }
  const testTo: string | null = opts.test ? (opts.to ?? FROM) : null

  const { data: settings } = await supabase.from('reminder_settings').select('*').eq('id', true).maybeSingle()
  if (!testTo && settings && settings.email_enabled === false) return j({ skipped: 'email disabled' })

  const { data: au } = await supabase.auth.admin.listUsers()
  const emailMap: Record<string, string> = {}
  for (const u of au?.users ?? []) if (u.email) emailMap[u.id] = u.email
  const { data: staff } = await supabase.from('profiles').select('id, name, role, notify_email').eq('is_active', true)
  const nameById: Record<string, string> = Object.fromEntries((staff ?? []).map(s => [s.id, s.name]))
  // Per-employee email opt-out (User Management): drop them so no email fires.
  for (const s of staff ?? []) if ((s as any).notify_email === false) delete emailMap[s.id]

  if (testTo) {
    const ok = await sendMail(testTo, opts.name ?? 'Tarun', '[TPS Xperts Group] Urgent alert (test)', box(opts.name ?? 'Tarun', '🔔 Urgent alerts test', `This confirms urgent alerts send correctly. Real alerts fire when a task is assigned.`))
    return j({ ok, test: true, to: testTo })
  }

  const sent: any[] = []
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

  // New-task and new-project alerts now fire instantly on ALL channels (bell + WhatsApp
  // + email) via the notifications dispatcher, so they were removed from here to avoid
  // duplicate emails. This job keeps only the alerts that have no other channel:
  // completed tasks, and task-extension requests / decisions.

  // ── Completed tasks (last 2h) → notify assigner ──
  const { data: doneTasks } = await supabase.from('tasks')
    .select('id, title, assigned_to, assigned_by, completed_at, project:projects(project_code), client:clients(company_name)')
    .eq('status', 'done').gte('completed_at', since)
  for (const t of doneTasks ?? []) {
    const uid = t.assigned_by
    if (!uid) continue
    const email = emailMap[uid]; if (!email) continue
    if (await sentEver(supabase, 'task_done', t.id, uid)) continue
    const html = box(nameById[uid] ?? '', '✅ Task completed', `<b>${esc(t.title)}</b><br>${t.project?.project_code ? 'Project ' + esc(t.project.project_code) + '<br>' : ''}${t.client?.company_name ? 'Client ' + esc(t.client.company_name) + '<br>' : ''}Completed by ${esc(nameById[t.assigned_to] ?? '—')}`)
    const ok = await sendMail(email, nameById[uid] ?? '', `[TPS Xperts Group] Task completed: ${t.title}`, html)
    await logSent(supabase, 'task_done', t.id, uid)
    sent.push({ kind: 'task_done', task: t.id, uid, ok })
  }

  // ── Extension requests (pending, last 2h) → notify assigner ──
  const { data: reqs } = await supabase.from('task_extension_requests')
    .select('id, extra_days, reason, requested_by, task:tasks(title, assigned_by)')
    .eq('status', 'pending').gte('created_at', since)
  for (const r of reqs ?? []) {
    const uid = (r as any).task?.assigned_by; if (!uid) continue
    const email = emailMap[uid]; if (!email) continue
    if (await sentEver(supabase, 'ext_req', r.id, uid)) continue
    const html = box(nameById[uid] ?? '', '⏳ Extension requested', `<b>${esc((r as any).task?.title)}</b><br>${esc(nameById[r.requested_by] ?? '—')} requested <b>+${r.extra_days} day(s)</b>.<br>Reason: ${esc(r.reason ?? '—')}<br>Open the task to approve or reject.`)
    const ok = await sendMail(email, nameById[uid] ?? '', `[TPS Xperts Group] Extension requested: ${(r as any).task?.title}`, html)
    await logSent(supabase, 'ext_req', r.id, uid)
    sent.push({ kind: 'ext_req', req: r.id, uid, ok })
  }

  // ── Extension decisions (decided last 2h) → notify requester ──
  const { data: decided } = await supabase.from('task_extension_requests')
    .select('id, extra_days, requested_by, status, task:tasks(title)')
    .in('status', ['approved', 'rejected']).gte('decided_at', since)
  for (const r of decided ?? []) {
    const uid = r.requested_by; if (!uid) continue
    const email = emailMap[uid]; if (!email) continue
    if (await sentEver(supabase, 'ext_dec', r.id, uid)) continue
    const verdict = r.status === 'approved' ? `approved (+${r.extra_days} day(s); due date extended)` : 'rejected'
    const html = box(nameById[uid] ?? '', '📌 Extension ' + r.status, `<b>${esc((r as any).task?.title)}</b><br>Your extension request was <b>${verdict}</b>.`)
    const ok = await sendMail(email, nameById[uid] ?? '', `[TPS Xperts Group] Extension ${r.status}: ${(r as any).task?.title}`, html)
    await logSent(supabase, 'ext_dec', r.id, uid)
    sent.push({ kind: 'ext_dec', req: r.id, uid, ok })
  }

  return j({ ok: true, sent: sent.length, results: sent })
})

async function sendMail(to: string, name: string, subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch(ZEPTO_URL, { method: 'POST', headers: { 'Authorization': AUTH, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ from: { address: FROM, name: 'TPS Xperts Group' }, to: [{ email_address: { address: to, name: name || to } }], subject, htmlbody: html }) })
    return res.ok
  } catch { return false }
}
async function sentEver(sb: any, kind: string, ref: string, recipient: string) {
  const { data } = await sb.from('notification_log').select('id').eq('kind', kind).eq('ref_id', ref).eq('recipient', recipient).limit(1)
  return (data ?? []).length > 0
}
async function logSent(sb: any, kind: string, ref: string, recipient: string) {
  await sb.from('notification_log').insert({ kind, ref_id: ref, recipient, channel: 'email' })
}
function esc(s: any) { return String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!)) }
function box(name: string, title: string, inner: string) {
  const header = `<tr><td style='background:#1E3A5F;border-radius:12px 12px 0 0;padding:18px 28px;'><table cellpadding='0' cellspacing='0'><tr><td style='padding-right:12px;'><table cellpadding='0' cellspacing='0'><tr><td style='width:42px;height:42px;background:#ffffff;border-radius:10px;text-align:center;vertical-align:middle;'><img src='https://portal.tpsxpert.com/logo.png' width='34' height='34' alt='TPS' style='display:inline-block;vertical-align:middle;' /></td></tr></table></td><td style='vertical-align:middle;'><span style='color:#ffffff;font-size:18px;font-weight:bold;'>TPS Xperts Group</span></td></tr></table></td></tr>`
  return `<!DOCTYPE html><html><body style='margin:0;background:#F3F4F6;font-family:Arial,sans-serif;'><table width='100%' cellpadding='0' cellspacing='0'><tr><td align='center' style='padding:28px 16px;'><table width='540' cellpadding='0' cellspacing='0' style='max-width:540px;'>${header}<tr><td style='background:#fff;border-radius:0 0 12px 12px;padding:22px 28px;'><p style='margin:0 0 12px;color:#374151;font-size:15px;'>Dear <strong>${esc(name)}</strong>,</p><h3 style='margin:0 0 10px;color:#1E3A5F;'>${title}</h3><p style='color:#374151;margin:0;line-height:1.6;'>${inner}</p><p style='margin:24px 0 0;padding-top:12px;border-top:1px solid #f0f0f0;color:#9CA3AF;font-size:12px;'>Automated message from TPS Xperts Group · <a href='https://portal.tpsxpert.com' style='color:#1E3A5F;'>portal.tpsxpert.com</a></p></td></tr></table></td></tr></table></body></html>`
}
function j(b: unknown, status = 200) { return new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } }) }
