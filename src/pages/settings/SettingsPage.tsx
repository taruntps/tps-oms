import { useState, useEffect } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { Sym } from '@/components/shared/Sym'
import { cn } from '@/lib/utils'
import { AttendanceSettingsSection } from './AttendanceSettingsSection'
import { ReminderSettingsSection } from './ReminderSettingsSection'
import { NotificationControlsSection } from './NotificationControlsSection'
import { WhatsAppTesterSection } from './WhatsAppTesterSection'

interface AppSettings {
  whatsapp_enabled: string
  whatsapp_api_key: string        // Meta permanent system-user access token
  whatsapp_phone_number_id: string // Meta Phone Number ID
}

const DEFAULT_SETTINGS: AppSettings = {
  whatsapp_enabled: 'false',
  whatsapp_api_key: '',
  whatsapp_phone_number_id: '',
}

// Templates that must be pre-approved in your Meta WhatsApp Manager
const REQUIRED_TEMPLATES = [
  { name: 'tps_stage_overdue',    params: ['Stage name + deadline', 'Details'],    desc: 'Sent when a project stage goes past due date' },
  { name: 'tps_payment_overdue',  params: ['Project code + client', 'Amount due'], desc: 'Reminder for an overdue project payment' },
  { name: 'tps_license_expiry',   params: ['License + client', 'Expiry date'],     desc: 'Alert when FSSAI licence is expiring in 7–90 days' },
  { name: 'tps_block_request',    params: ['Project code', 'Block reason'],         desc: 'Notifies admins when a block/unblock/cancel request is raised or decided' },
  { name: 'tps_block_escalation', params: ['Project code', 'Requester name', 'Block type', 'Hours waiting'], desc: 'Escalation when a block request is pending > 4 hours' },
  { name: 'tps_task_assigned',    params: ['Name', 'Task/stage', 'Project', 'Due date'], desc: 'Sent to the executive when a stage/task is assigned' },
  { name: 'tps_project_assigned', params: ['Name', 'Project', 'Client'],           desc: 'Sent when a new project is assigned' },
  { name: 'tps_project_completed',params: ['Project', 'Client', 'Date'],           desc: 'Sent when a project is marked completed' },
  { name: 'tps_morning_digest',   params: ['Name', 'Pending stages', 'Overdue', 'Pending projects'], desc: 'Daily 9 AM per-person summary' },
  { name: 'tps_payment_weekly',   params: ['Client count', 'Total ₹', 'Client list'], desc: 'Monday 9 AM payment-pending summary to admins' },
]

export default function SettingsPage() {
  const { profile } = useAuth()
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [myPhone, setMyPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingPhone, setSavingPhone] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)

  useEffect(() => {
    loadSettings()
    loadMyPhone()
  }, [])

  async function loadSettings() {
    const { data } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['whatsapp_enabled', 'whatsapp_api_key', 'whatsapp_phone_number_id'])
    if (data) {
      const merged = { ...DEFAULT_SETTINGS }
      for (const row of data) {
        if (row.key in merged) (merged as Record<string, string>)[row.key] = row.value ?? ''
      }
      setSettings(merged)
    }
  }

  async function loadMyPhone() {
    if (!profile) return
    const { data } = await supabase
      .from('profiles')
      .select('whatsapp_number, phone')
      .eq('id', profile.id)
      .single()
    if (data) setMyPhone(data.whatsapp_number ?? data.phone ?? '')
  }

  async function saveSettings() {
    setSaving(true)
    try {
      const upserts = Object.entries(settings).map(([key, value]) => ({
        key,
        value,
        updated_by: profile!.id,
        updated_at: new Date().toISOString(),
      }))
      const { error } = await supabase.from('app_settings').upsert(upserts, { onConflict: 'key' })
      if (error) throw error
      toast.success('Settings saved')
    } catch (err: unknown) {
      toast.error('Save failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  async function saveMyPhone() {
    setSavingPhone(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ whatsapp_number: myPhone || null })
        .eq('id', profile!.id)
      if (error) throw error
      toast.success('WhatsApp number saved')
    } catch (err: unknown) {
      toast.error('Save failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSavingPhone(false)
    }
  }

  const isEnabled = settings.whatsapp_enabled === 'true'

  return (
    <div>
      <TopBar title="Settings" subtitle="System configuration" />

      <div className="p-6 space-y-6 animate-fade-up max-w-2xl">

        {/* Attendance & Geofence */}
        <AttendanceSettingsSection />

        {/* Email & Reminders (task digest + urgent alerts) */}
        <ReminderSettingsSection />

        {/* Notification Controls — which types + per-user subscriptions */}
        <NotificationControlsSection />

        {/* WhatsApp Template Tester — manual live-trigger for every template */}
        <WhatsAppTesterSection />

        {/* WhatsApp Notifications */}
        <section className="bg-white rounded-xl border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
              <Sym name="chat" size={14} className="text-green-700" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-brand-950">WhatsApp Notifications</h2>
              <p className="text-[11px] text-muted-foreground">Automated alerts via Meta Cloud API (your own WABA)</p>
            </div>
          </div>

          <div className="p-5 space-y-5">

            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-brand-950">Enable WhatsApp alerts</p>
                <p className="text-xs text-muted-foreground">When off, all WhatsApp dispatches are silently skipped</p>
              </div>
              <button
                onClick={() => setSettings(s => ({ ...s, whatsapp_enabled: s.whatsapp_enabled === 'true' ? 'false' : 'true' }))}
                className={cn(
                  'relative w-11 h-6 rounded-full transition-colors',
                  isEnabled ? 'bg-green-500' : 'bg-gray-200'
                )}
              >
                <span className={cn(
                  'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                  isEnabled && 'translate-x-5'
                )} />
              </button>
            </div>

            {/* Phone Number ID */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Phone Number ID</label>
              <input
                type="text"
                value={settings.whatsapp_phone_number_id}
                onChange={e => setSettings(s => ({ ...s, whatsapp_phone_number_id: e.target.value }))}
                placeholder="e.g. 123456789012345"
                className="mt-1.5 w-full px-3 py-2 text-sm border border-border rounded-lg bg-[#F8FAFC] font-mono focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Meta Business Manager → WhatsApp → Phone Numbers → select your number → Phone Number ID
              </p>
            </div>

            {/* Access Token */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Permanent Access Token</label>
              <input
                type="password"
                value={settings.whatsapp_api_key}
                onChange={e => setSettings(s => ({ ...s, whatsapp_api_key: e.target.value }))}
                placeholder="Paste your system user token"
                className="mt-1.5 w-full px-3 py-2 text-sm border border-border rounded-lg bg-[#F8FAFC] font-mono focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Meta Business Manager → System Users → select user → Generate Token → select your app → add <code className="font-mono bg-gray-100 px-0.5 rounded">whatsapp_business_messaging</code> permission
              </p>
            </div>

            <button
              onClick={saveSettings}
              disabled={saving}
              className="w-full py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save WhatsApp Settings'}
            </button>
          </div>
        </section>

        {/* My WhatsApp Number */}
        <section className="bg-white rounded-xl border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center">
              <Sym name="notifications" size={14} className="text-brand-700" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-brand-950">My Notification Number</h2>
              <p className="text-[11px] text-muted-foreground">WhatsApp alerts for your projects will be sent here</p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">WhatsApp Mobile Number</label>
              <div className="flex gap-2 mt-1.5">
                <input
                  type="tel"
                  value={myPhone}
                  onChange={e => setMyPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
                <button
                  onClick={saveMyPhone}
                  disabled={savingPhone}
                  className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
                >
                  {savingPhone ? 'Saving…' : 'Save'}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                To send test messages, use the <strong>WhatsApp Template Tester</strong> above.
              </p>
            </div>
          </div>
        </section>

        {/* Required Templates */}
        <section className="bg-white rounded-xl border border-border">
          <button
            onClick={() => setShowTemplates(t => !t)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-[#F8FAFC] transition-colors rounded-xl"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center">
                <Sym name="settings" size={14} className="text-purple-700" />
              </div>
              <div className="text-left">
                <h2 className="text-sm font-semibold text-brand-950">WhatsApp Template Setup</h2>
                <p className="text-[11px] text-muted-foreground">{REQUIRED_TEMPLATES.length} templates registered in Meta WhatsApp Manager</p>
              </div>
            </div>
            {showTemplates ? <Sym name="expand_less" size={14} className="text-muted-foreground" /> : <Sym name="expand_more" size={14} className="text-muted-foreground" />}
          </button>

          {showTemplates && (
            <div className="border-t border-border divide-y divide-border">
              {REQUIRED_TEMPLATES.map(tpl => (
                <div key={tpl.name} className="px-5 py-3.5">
                  <div className="flex items-start gap-2">
                    <Sym name="check_circle" size={12} className="text-green-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-mono font-semibold text-brand-950">{tpl.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{tpl.desc}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {tpl.params.map((p, i) => (
                          <span key={i} className="text-[10px] bg-[#F8FAFC] border border-border px-1.5 py-0.5 rounded font-mono">
                            {`{{${i + 1}}}`} {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="px-5 py-3.5 bg-amber-50 rounded-b-xl">
                <div className="flex items-start gap-2">
                  <Sym name="error" size={12} className="text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-amber-800">
                    Templates must be approved by Meta in your WhatsApp Business Manager before they can be sent.
                    Approval takes 24–48 hours. Use the exact template names above.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
