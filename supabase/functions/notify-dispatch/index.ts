import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ZeptoMail (India DC) for the email leg: every event notification also emails its
// recipient, respecting the per-employee notify_email toggle.
const ZEPTO_URL = 'https://api.zeptomail.in/v1.1/email'
const RAW_ZEPTO = Deno.env.get('ZEPTOMAIL_TOKEN') ?? ''
const ZEPTO_AUTH = RAW_ZEPTO.startsWith('Zoho-enczapikey') ? RAW_ZEPTO : `Zoho-enczapikey ${RAW_ZEPTO}`
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? 'noreply@tpsxpert.com'

// Event notifications that ALSO go out by email. Excludes stage_overdue (high-volume —
// the daily digest covers it) and whatsapp_reply (the inbound webhook already emails it).
const EMAIL_TYPES = [
  'task_assigned', 'project_assigned', 'project_completed',
  'block_request', 'unblock_request', 'cancel_request',
  'block_approved', 'block_rejected', 'cancel_approved', 'cancel_rejected',
  'payment_overdue', 'license_expiring',
]

// All notification types that send a WhatsApp push
const WA_TYPES = [
  'stage_overdue',
  'payment_overdue',
  'license_expiring',
  'block_request',
  'block_approved',
  'block_rejected',
  'unblock_request',
  'cancel_request',
  'cancel_approved',
  'cancel_rejected',
  'task_assigned',
  'project_assigned',
  'project_completed',
]

type NotifRow = {
  id: string
  type: string
  title: string
  body: string | null
  meta: Record<string, string>
  profiles: { name: string; whatsapp_number?: string; phone?: string } | null
}

function buildParams(n: NotifRow): { template: string; params: string[] } | null {
  const m = n.meta ?? {}
  const name = n.profiles?.name ?? 'Team'

  switch (n.type) {
    case 'stage_overdue':
      return { template: 'tps_stage_overdue', params: [n.title, n.body ?? ''] }

    case 'payment_overdue':
      return { template: 'tps_payment_overdue', params: [n.title, n.body ?? ''] }

    case 'license_expiring':
      return { template: 'tps_license_expiry', params: [n.title, n.body ?? ''] }

    case 'block_request':
    case 'block_approved':
    case 'block_rejected':
    case 'unblock_request':
    case 'cancel_request':
    case 'cancel_approved':
    case 'cancel_rejected':
      // All approval-flow messages reuse the generic title/body template
      return { template: 'tps_block_request', params: [n.title, n.body ?? ''] }

    case 'task_assigned':
      return {
        template: 'tps_task_assigned',
        params: [
          name,
          m.stage_name   ?? n.title,
          m.project_name ?? '—',
          m.due_date     ?? 'Not set',
        ],
      }

    case 'project_assigned':
      return {
        template: 'tps_project_assigned',
        params: [
          name,
          m.project_name ?? n.title,
          m.client_name  ?? '—',
        ],
      }

    case 'project_completed':
      return {
        template: 'tps_project_completed',
        params: [
          m.project_name ?? n.title,
          m.client_name  ?? '—',
          m.date         ?? new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        ],
      }

    default:
      return null
  }
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
    const { data: pending, error } = await supabase
      .from('notifications')
      .select('id, type, title, body, meta, profiles:user_id(name, whatsapp_number, phone)')
      .in('type', WA_TYPES)
      .is('whatsapp_sent_at', null)
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) return json({ error: error.message }, 500)

    const results: { id: string; status: string; reason?: string }[] = []

    for (const n of (pending ?? []) as NotifRow[]) {
      const profile = n.profiles
      const rawPhone = profile?.whatsapp_number ?? profile?.phone
      if (!rawPhone) {
        await markSent(supabase, n.id) // mark so we don't retry forever
        results.push({ id: n.id, status: 'skipped', reason: 'no_phone' })
        continue
      }

      const phone = rawPhone.replace(/\D/g, '').replace(/^0/, '').replace(/^(?!91)/, '91')
      const tpl = buildParams(n)
      if (!tpl) {
        results.push({ id: n.id, status: 'skipped', reason: 'unknown_type' })
        continue
      }

      const res = await fetch(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({ phone, template: tpl.template, params: tpl.params, refId: n.id }),
      })

      await markSent(supabase, n.id)
      results.push({ id: n.id, status: res.ok ? 'sent' : 'failed' })
    }

    // ── Email leg: one email per new event notification (respects notify_email) ──
    let emailed = 0
    const { data: pendingEmail } = await supabase
      .from('notifications')
      .select('id, type, title, body, profiles:user_id(name, email, notify_email)')
      .in('type', EMAIL_TYPES)
      .is('email_sent_at', null)
      .order('created_at', { ascending: true })
      .limit(50)

    for (const n of (pendingEmail ?? []) as any[]) {
      const p = n.profiles
      const to = p?.email as string | undefined
      if (RAW_ZEPTO && to && p?.notify_email !== false) {
        try {
          await fetch(ZEPTO_URL, {
            method: 'POST',
            headers: { 'Authorization': ZEPTO_AUTH, 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
              from: { address: MAIL_FROM, name: 'TPS Xperts Group' },
              to: [{ email_address: { address: to, name: p?.name ?? to } }],
              subject: `[TPS Xperts Group] ${n.title}`,
              htmlbody: emailBox(p?.name ?? '', n.title, n.body ?? ''),
            }),
          })
          emailed++
        } catch (e) { console.error('email leg', String(e)) }
      }
      // Mark once regardless (sent / opted-out / no address) so it is not reprocessed.
      await supabase.from('notifications').update({ email_sent_at: new Date().toISOString() }).eq('id', n.id)
    }

    return json({ dispatched: results.filter(r => r.status === 'sent').length, emailed, results })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

async function markSent(supabase: ReturnType<typeof createClient>, id: string) {
  await supabase.from('notifications').update({ whatsapp_sent_at: new Date().toISOString() }).eq('id', id)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function esc(s: unknown) {
  return String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))
}

// Branded email wrapper (mirrors the urgent-alerts / digest look).
function emailBox(name: string, title: string, inner: string) {
  const header = `<tr><td style='background:#1E3A5F;border-radius:12px 12px 0 0;padding:18px 28px;'><span style='color:#ffffff;font-size:18px;font-weight:bold;'>TPS Xperts Group</span></td></tr>`
  return `<!DOCTYPE html><html><body style='margin:0;background:#F3F4F6;font-family:Arial,sans-serif;'><table width='100%' cellpadding='0' cellspacing='0'><tr><td align='center' style='padding:28px 16px;'><table width='540' cellpadding='0' cellspacing='0' style='max-width:540px;'>${header}<tr><td style='background:#fff;border-radius:0 0 12px 12px;padding:22px 28px;'><p style='margin:0 0 12px;color:#374151;font-size:15px;'>Dear <strong>${esc(name)}</strong>,</p><h3 style='margin:0 0 10px;color:#1E3A5F;'>${esc(title)}</h3><p style='color:#374151;margin:0;line-height:1.6;'>${esc(inner)}</p><p style='margin:24px 0 0;padding-top:12px;border-top:1px solid #f0f0f0;color:#9CA3AF;font-size:12px;'>Automated message from TPS Xperts Group · <a href='https://portal.tpsxpert.com' style='color:#1E3A5F;'>portal.tpsxpert.com</a></p></td></tr></table></td></tr></table></body></html>`
}
