import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/shared/Toast'
import { Sym } from '@/components/shared/Sym'
import { cn } from '@/lib/utils'

// Controls the reminder engine (daily-reminders + urgent-alerts edge functions),
// backed by the reminder_settings singleton (row id = true).
export function ReminderSettingsSection() {
  const [email, setEmail] = useState(true)
  const [whatsapp, setWhatsapp] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('reminder_settings').select('*').eq('id', true).maybeSingle()
    if (data) {
      setEmail(data.email_enabled ?? true)
      setWhatsapp(data.whatsapp_enabled ?? false)
    }
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    try {
      const { error } = await supabase.from('reminder_settings')
        .update({ email_enabled: email, whatsapp_enabled: whatsapp })
        .eq('id', true)
      if (error) throw error
      toast.success('Reminder settings saved')
    } catch (e: any) {
      toast.error('Save failed', e.message)
    } finally { setSaving(false) }
  }

  return (
    <section className="bg-white rounded-xl border border-border">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center">
          <Sym name="notifications_active" size={14} className="text-brand-700" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-brand-950">Email & Reminders</h2>
          <p className="text-[11px] text-muted-foreground">Daily task digest (9:00 AM IST) + instant alerts</p>
        </div>
      </div>

      <div className="p-5 space-y-5">
        <Toggle
          label="Email reminders"
          hint="Daily 9 AM digest of open/overdue tasks, plus instant emails on task assignment and licence expiry. Sent via ZeptoMail."
          on={email} disabled={loading}
          onClick={() => setEmail(v => !v)}
          color="bg-brand-600"
        />

        <Toggle
          label="WhatsApp reminders"
          hint="Same alerts over WhatsApp. Inactive until the AiSensy business number is approved — the switch is saved but has no effect yet."
          on={whatsapp} disabled={loading}
          onClick={() => setWhatsapp(v => !v)}
          color="bg-green-500"
          badge="Coming soon"
        />

        <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-[#F8FAFC] border border-border rounded-lg p-3">
          <Sym name="schedule" size={13} className="mt-0.5 shrink-0" />
          <span>The daily digest runs automatically at <strong>9:00 AM IST</strong>; urgent alerts are checked hourly. No manual action needed.</span>
        </div>

        <button onClick={save} disabled={saving || loading}
          className="w-full py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : 'Save Reminder Settings'}
        </button>
      </div>
    </section>
  )
}

function Toggle({ label, hint, on, onClick, disabled, color, badge }: {
  label: string; hint: string; on: boolean; onClick: () => void; disabled?: boolean; color: string; badge?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-brand-950 flex items-center gap-2">
          {label}
          {badge && <span className="text-[9px] uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{badge}</span>}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      <button onClick={onClick} disabled={disabled}
        className={cn('relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50', on ? color : 'bg-gray-200')}>
        <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', on && 'translate-x-5')} />
      </button>
    </div>
  )
}
