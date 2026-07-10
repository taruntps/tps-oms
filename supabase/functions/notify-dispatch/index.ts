import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
    if (!pending?.length) return json({ dispatched: 0 })

    const results: { id: string; status: string; reason?: string }[] = []

    for (const n of pending as NotifRow[]) {
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

    return json({ dispatched: results.filter(r => r.status === 'sent').length, results })
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
