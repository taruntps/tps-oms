// Supabase Edge Function: urgent-alerts  (ZeptoMail / India DC)
// Cron: hourly. Fires immediate emails (deduped once-ever per ref+recipient):
//   • New task (created in the last ~2h) → assignee + assigner
// Licences are handled by the daily digest (consolidated, one email) to avoid a
// per-licence email burst.
//
// Manual test (no real emails, no logging):  POST { "test": true, "to": "...", "name": "..." }
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
  const { data: staff } = await supabase.from('profiles').select('id, name, role').eq('is_active', true)
  const nameById: Record<string, string> = Object.fromEntries((staff ?? []).map(s => [s.id, s.name]))

  if (testTo) {
    const ok = await sendMail(testTo, opts.name ?? 'Tarun', '[TPS OMS] Urgent alert (test)', box('🔔 Urgent alerts test', `Hi ${esc(opts.name ?? 'Tarun')}, this confirms urgent alerts send correctly. Real alerts fire when a task is assigned.`))
    return j({ ok, test: true, to: testTo })
  }

  const sent: any[] = []
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const { data: newTasks } = await supabase.from('tasks')
    .select('id, title, priority, due_date, assigned_to, assigned_by, project:projects(project_code), client:clients(company_name)')
    .gte('created_at', since)
  for (const t of newTasks ?? []) {
    const recips = Array.from(new Set([t.assigned_to, t.assigned_by].filter(Boolean))) as string[]
    for (const uid of recips) {
      const email = emailMap[uid]
      if (!email) continue
      if (await sentEver(supabase, 'task_new', t.id, uid)) continue
      const role = uid === t.assigned_to ? 'assigned to you' : 'you assigned'
      const html = box('📋 New task ' + role, `<b>${esc(t.title)}</b><br>${t.project?.project_code ? 'Project ' + esc(t.project.project_code) + '<br>' : ''}${t.client?.company_name ? 'Client ' + esc(t.client.company_name) + '<br>' : ''}Priority: ${esc(t.priority)}${t.due_date ? '<br>Due: ' + t.due_date : ''}<br>For: ${esc(nameById[t.assigned_to] ?? '—')}`)
      const ok = await sendMail(email, nameById[uid] ?? '', `[TPS OMS] New task: ${t.title}`, html)
      await logSent(supabase, 'task_new', t.id, uid)
      sent.push({ kind: 'task_new', task: t.id, uid, ok })
    }
  }

  return j({ ok: true, sent: sent.length, results: sent })
})

async function sendMail(to: string, name: string, subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch(ZEPTO_URL, { method: 'POST', headers: { 'Authorization': AUTH, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ from: { address: FROM, name: 'TPS Xperts OMS' }, to: [{ email_address: { address: to, name: name || to } }], subject, htmlbody: html }) })
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
function box(title: string, inner: string) {
  return `<!DOCTYPE html><html><body style="margin:0;background:#F3F4F6;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 16px;"><table width="540" cellpadding="0" cellspacing="0" style="max-width:540px;"><tr><td style="background:#1E3A5F;border-radius:12px 12px 0 0;padding:20px 28px;"><h1 style="color:#fff;margin:0;font-size:18px;">TPS Xperts OMS</h1></td></tr><tr><td style="background:#fff;border-radius:0 0 12px 12px;padding:22px 28px;"><h3 style="margin:0 0 10px;color:#1E3A5F;">${title}</h3><p style="color:#374151;margin:0;line-height:1.6;">${inner}</p><p style="margin:24px 0 0;padding-top:12px;border-top:1px solid #f0f0f0;color:#9CA3AF;font-size:12px;"><a href="https://portal.tpsxpert.com" style="color:#1E3A5F;">Open portal.tpsxpert.com</a></p></td></tr></table></td></tr></table></body></html>`
}
function j(b: unknown, status = 200) { return new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } }) }
