import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { Sym } from '@/components/shared/Sym'
import { cn } from '@/lib/utils'

// Every approved template with realistic sample params (in {{n}} order).
// Keep names EXACTLY as approved in Meta WhatsApp Manager.
const TEMPLATES: { name: string; label: string; params: string[] }[] = [
  { name: 'tps_stage_overdue',    label: 'Stage overdue',        params: ['Document Collection & Verification', 'Project TPS-P-2026-0001 for ACME PVT LTD'] },
  { name: 'tps_payment_overdue',  label: 'Payment overdue',      params: ['TPS-P-2026-0001 — ACME PVT LTD', '5,000'] },
  { name: 'tps_license_expiry',   label: 'Licence expiry',       params: ['FSSAI Licence — ACME PVT LTD', '31 Aug 2026'] },
  { name: 'tps_block_request',    label: 'Block request',        params: ['TPS-P-2026-0001', 'Client documents pending'] },
  { name: 'tps_block_escalation', label: 'Block escalation',     params: ['TPS-P-2026-0001', 'Priya Vanshika', 'Document pending', '6'] },
  { name: 'tps_task_assigned',    label: 'Task assigned',        params: ['Prabhjot', 'Status at FSSAI', 'TPS-P-2026-0001', '15 Aug 2026'] },
  { name: 'tps_project_assigned', label: 'Project assigned',     params: ['Prabhjot', 'TPS-P-2026-0001', 'ACME PVT LTD'] },
  { name: 'tps_project_completed',label: 'Project completed',    params: ['TPS-P-2026-0001', 'ACME PVT LTD', '10 Jul 2026'] },
  { name: 'tps_morning_digest',   label: 'Morning digest',       params: ['Tarun', '16', '6', '16'] },
  { name: 'tps_payment_weekly',   label: 'Weekly payment alert', params: ['1', '5,000', 'ACME PVT LTD'] },
]

type SendState = 'idle' | 'sending' | 'sent' | 'failed'

export function WhatsAppTesterSection() {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState<Record<string, SendState>>({})
  const [sendingAll, setSendingAll] = useState(false)

  useEffect(() => {
    if (!profile) return
    supabase.from('profiles').select('whatsapp_number, phone').eq('id', profile.id).single()
      .then(({ data }) => { if (data) setPhone(data.whatsapp_number ?? data.phone ?? '') })
  }, [profile])

  const normalise = (p: string) => p.replace(/\D/g, '').replace(/^0/, '').replace(/^(?!91)/, '91')

  async function sendOne(tpl: typeof TEMPLATES[number]): Promise<boolean> {
    setStatus(s => ({ ...s, [tpl.name]: 'sending' }))
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: { phone: normalise(phone), template: tpl.name, params: tpl.params, refId: `manual_test_${tpl.name}` },
      })
      const ok = !error && (data?.success !== false)
      setStatus(s => ({ ...s, [tpl.name]: ok ? 'sent' : 'failed' }))
      if (!ok) {
        const msg = data?.data?.error?.message ?? error?.message ?? 'Unknown error'
        toast.error(`${tpl.label} failed`, String(msg).slice(0, 120))
      }
      return ok
    } catch (e: any) {
      setStatus(s => ({ ...s, [tpl.name]: 'failed' }))
      toast.error(`${tpl.label} failed`, e.message)
      return false
    }
  }

  async function handleSendOne(tpl: typeof TEMPLATES[number]) {
    if (!phone) { toast.error('Enter a test number first'); return }
    const ok = await sendOne(tpl)
    if (ok) toast.success(`${tpl.label} sent`, `Check WhatsApp on ${phone}`)
  }

  async function handleSendAll() {
    if (!phone) { toast.error('Enter a test number first'); return }
    setSendingAll(true)
    let ok = 0
    for (const tpl of TEMPLATES) {
      if (await sendOne(tpl)) ok++
      await new Promise(r => setTimeout(r, 700))   // gentle pacing to avoid rate limits
    }
    setSendingAll(false)
    toast.success('Test run complete', `${ok}/${TEMPLATES.length} templates sent to ${phone}`)
  }

  const dot = (st?: SendState) =>
    st === 'sent' ? 'text-green-600' : st === 'failed' ? 'text-red-600' : st === 'sending' ? 'text-amber-500' : 'text-muted-foreground/40'
  const icon = (st?: SendState) =>
    st === 'sent' ? 'check_circle' : st === 'failed' ? 'cancel' : st === 'sending' ? 'progress_activity' : 'radio_button_unchecked'

  return (
    <section className="bg-white rounded-xl border border-border">
      <button onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-[#F8FAFC] transition-colors rounded-xl">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
            <Sym name="send" size={14} className="text-green-700" />
          </div>
          <div className="text-left">
            <h2 className="text-sm font-semibold text-brand-950">WhatsApp Template Tester</h2>
            <p className="text-[11px] text-muted-foreground">Fire a live test of any template with sample data</p>
          </div>
        </div>
        <Sym name={open ? 'expand_less' : 'expand_more'} size={14} className="text-muted-foreground" />
      </button>

      {open && (
        <div className="border-t border-border p-5 space-y-4">
          {/* Test number + Send All */}
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Send test to</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="mt-1.5 w-full px-3 py-2 text-sm border border-border rounded-lg bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </div>
            <button onClick={handleSendAll} disabled={sendingAll || !phone}
              className="flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              <Sym name="send" size={13} /> {sendingAll ? 'Sending all…' : `Send all ${TEMPLATES.length}`}
            </button>
          </div>

          {/* Per-template rows */}
          <div className="rounded-lg border border-border divide-y divide-border">
            {TEMPLATES.map(tpl => (
              <div key={tpl.name} className="flex items-center gap-3 px-3 py-2.5">
                <Sym name={icon(status[tpl.name])} size={14}
                  className={cn(dot(status[tpl.name]), status[tpl.name] === 'sending' && 'animate-spin')} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-brand-950">{tpl.label}</p>
                  <p className="text-[10px] font-mono text-muted-foreground truncate">{tpl.name}</p>
                </div>
                <button onClick={() => handleSendOne(tpl)}
                  disabled={sendingAll || status[tpl.name] === 'sending' || !phone}
                  className="text-[11px] px-3 py-1 border border-border rounded-lg hover:bg-[#F8FAFC] text-brand-600 disabled:opacity-40">
                  Send
                </button>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Uses your live Meta Cloud API with sample data. WhatsApp must be enabled above and the number must be a valid WhatsApp account.
          </p>
        </div>
      )}
    </section>
  )
}
