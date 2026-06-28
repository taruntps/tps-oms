import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/shared/Toast'
import { Sym } from '@/components/shared/Sym'
import { cn } from '@/lib/utils'

const DIGEST_HOURS = [
  { value: 7,  label: '7:00 AM IST' },
  { value: 8,  label: '8:00 AM IST' },
  { value: 9,  label: '9:00 AM IST (default)' },
  { value: 10, label: '10:00 AM IST' },
  { value: 11, label: '11:00 AM IST' },
  { value: 18, label: '6:00 PM IST' },
]

export function ReminderSettingsSection() {
  const [email,      setEmail]      = useState(true)
  const [whatsapp,   setWhatsapp]   = useState(false)
  const [digestHour, setDigestHour] = useState(9)
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('reminder_settings')
      .select('email_enabled, whatsapp_enabled, digest_hour_ist')
      .eq('id', true)
      .maybeSingle()
    if (data) {
      setEmail(data.email_enabled ?? true)
      setWhatsapp(data.whatsapp_enabled ?? false)
      setDigestHour(data.digest_hour_ist ?? 9)
    }
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('reminder_settings')
        .update({ email_enabled: email, whatsapp_enabled: whatsapp, digest_hour_ist: digestHour })
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
          <p className="text-[11px] text-muted-foreground">Daily digest delivery + instant urgent alerts</p>
        </div>
      </div>

      <div className="p-5 space-y-5">
        <Toggle
          label="Email reminders"
          hint="Daily digest of open/overdue tasks + instant emails on assignment and licence expiry. Sent via ZeptoMail."
          on={email} disabled={loading}
          onClick={() => setEmail(v => !v)}
          color="bg-brand-600"
        />

        <Toggle
          label="WhatsApp reminders"
          hint="Same alerts over WhatsApp. Inactive until the AiSensy business number is approved."
          on={whatsapp} disabled={loading}
          onClick={() => setWhatsapp(v => !v)}
          color="bg-green-500"
          badge="Coming soon"
        />

        {/* Digest hour picker */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Daily digest time
          </label>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {DIGEST_HOURS.map(h => (
              <button
                key={h.value}
                onClick={() => setDigestHour(h.value)}
                disabled={loading}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-lg border transition-all',
                  digestHour === h.value
                    ? 'bg-brand-600 text-white border-brand-700'
                    : 'border-border text-muted-foreground hover:border-brand-300 hover:text-brand-700',
                )}
              >
                {h.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Urgent alerts (overdue, expiry) are checked hourly regardless of this setting.
          </p>
        </div>

        <button
          onClick={save}
          disabled={saving || loading}
          className="w-full py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
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
      <button
        onClick={onClick}
        disabled={disabled}
        className={cn('relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50', on ? color : 'bg-gray-200')}
      >
        <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', on && 'translate-x-5')} />
      </button>
    </div>
  )
}

