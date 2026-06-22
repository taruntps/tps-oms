import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Escalate block requests that have been pending manager approval for > 4 hours
const ESCALATION_THRESHOLD_HOURS = 4

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const sendUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-whatsapp`
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  try {
    const threshold = new Date(
      Date.now() - ESCALATION_THRESHOLD_HOURS * 60 * 60 * 1000
    ).toISOString()

    // Block requests still awaiting approval
    const { data: stale, error: fetchErr } = await supabase
      .from('block_requests')
      .select(`
        *,
        projects(project_code, project_name, manager_id),
        profiles!block_requests_requested_by_fkey(name)
      `)
      .is('approved', null)
      .lt('requested_at', threshold)

    if (fetchErr) return json({ error: fetchErr.message }, 500)
    if (!stale?.length) return json({ escalated: 0 })

    // All active managers / directors who can approve
    const { data: managers } = await supabase
      .from('profiles')
      .select('id, name, whatsapp_number, phone')
      .in('role', ['manager', 'director', 'super_admin'])
      .eq('is_active', true)

    const results: { block_id: string; manager: string }[] = []

    for (const req of stale) {
      const project = (req as Record<string, unknown>).projects as { project_code?: string; project_name?: string } | null
      const requester = (req as Record<string, unknown>).profiles as { name?: string } | null
      const hoursWaiting = Math.round(
        (Date.now() - new Date(req.requested_at).getTime()) / 3_600_000
      )

      for (const mgr of managers ?? []) {
        const rawPhone = mgr.whatsapp_number ?? mgr.phone
        if (!rawPhone) continue
        const phone = rawPhone.replace(/\D/g, '').replace(/^0/, '').replace(/^(?!91)/, '91')

        // WhatsApp ping
        await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            phone,
            template: 'tps_block_escalation',
            params: [
              project?.project_code ?? req.project_id,
              requester?.name ?? 'Team member',
              req.block_type.replace(/_/g, ' '),
              `${hoursWaiting} hrs`,
            ],
            refId: `escalate_${req.id}_${mgr.id}`,
          }),
        })

        // In-app notification (idempotent via conflict ignore)
        await supabase.from('notifications').insert({
          user_id: mgr.id,
          type: 'block_request',
          title: `Block escalation: ${project?.project_code ?? 'Unknown project'}`,
          body: `${requester?.name ?? 'Someone'} requested a block ${hoursWaiting}h ago — still pending your approval`,
          reference_id: req.project_id,
          reference_type: 'project',
        })

        results.push({ block_id: req.id, manager: mgr.name })
      }
    }

    return json({ escalated: results.length, details: results })
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
