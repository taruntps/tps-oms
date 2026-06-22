import { useState, useEffect } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { Settings, MessageCircle, Bell, ChevronDown, ChevronUp, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type BSP = 'interakt' | 'wati' | 'aisensy'

interface AppSettings {
  whatsapp_enabled: string
  whatsapp_bsp: string
  whatsapp_api_key: string
  whatsapp_wati_url: string
}

const DEFAULT_SETTINGS: AppSettings = {
  whatsapp_enabled: 'false',
  whatsapp_bsp: 'interakt',
  whatsapp_api_key: '',
  whatsapp_wati_url: '',
}

const BSP_INFO: Record<BSP, { label: string; url: string; keyLabel: string; keyHint: string }> = {
  interakt: {
    label: 'Interakt',
    url: 'https://app.interakt.ai',
    keyLabel: 'API Key',
    keyHint: 'Found in Interakt → Settings → Developer → API Keys',
  },
  wati: {
    label: 'WATI',
    url: 'https://app.wati.io',
    keyLabel: 'Bearer Token',
    keyHint: 'Found in WATI → Account → API Access',
  },
  aisensy: {
    label: 'AiSensy',
    url: 'https://app.aisensy.com',
    keyLabel: 'API Key',
    keyHint: 'Found in AiSensy → Settings → API Key',
  },
}

// Templates that must be pre-approved in your BSP account
const REQUIRED_TEMPLATES = [
  { name: 'tps_stage_overdue',    params: ['Stage name + deadline', 'Details'],    desc: 'Sent when a project stage goes past due date' },
  { name: 'tps_payment_overdue',  params: ['Project code + client', 'Amount due'], desc: 'Weekly reminder for outstanding payments' },
  { name: 'tps_license_expiry',   params: ['License + client', 'Expiry date'],     desc: 'Alert when FSSAI licence is expiring in 7–90 days' },
  { name: 'tps_block_request',    params: ['Project code', 'Block reason'],         desc: 'Notifies manager when an employee requests a block' },
  { name: 'tps_block_escalation', params: ['Project code', 'Requester name', 'Block type', 'Hours waiting'], desc: 'Escalation when block request is pending > 4 hours' },
]

export default function SettingsPage() {
  const { profile } = useAuth()
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [myPhone, setMyPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingPhone, setSavingPhone] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    loadSettings()
    loadMyPhone()
  }, [])

  async function loadSettings() {
    const { data } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', Object.keys(DEFAULT_SETTINGS))
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

  async function testSend() {
    if (!myPhone) { toast.error('Set your WhatsApp number first'); return }
    setTesting(true)
    try {
      const phone = myPhone.replace(/\D/g, '').replace(/^0/, '').replace(/^(?!91)/, '91')
      const { error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          phone,
          template: 'tps_stage_overdue',
          params: ['Test Stage', 'This is a test message from TPS-OMS Settings'],
          refId: 'settings_test',
        },
      })
      if (error) throw error
      toast.success('Test sent', 'Check your WhatsApp for the test message')
    } catch (err: unknown) {
      toast.error('Test failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setTesting(false)
    }
  }

  const bsp = (settings.whatsapp_bsp as BSP) || 'interakt'
  const bspInfo = BSP_INFO[bsp]
  const isEnabled = settings.whatsapp_enabled === 'true'

  return (
    <div>
      <TopBar title="Settings" subtitle="System configuration" />

      <div className="p-6 space-y-6 animate-fade-up max-w-2xl">

        {/* WhatsApp Notifications */}
        <section className="bg-white rounded-xl border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
              <MessageCircle size={14} className="text-green-700" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-brand-950">WhatsApp Notifications</h2>
              <p className="text-[11px] text-muted-foreground">Automated alerts via BSP (Interakt / WATI / AiSensy)</p>
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

            {/* BSP selector */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">BSP Provider</label>
              <div className="flex gap-2 mt-1.5">
                {(['interakt', 'wati', 'aisensy'] as BSP[]).map(b => (
                  <button
                    key={b}
                    onClick={() => setSettings(s => ({ ...s, whatsapp_bsp: b }))}
                    className={cn(
                      'flex-1 py-2 px-3 text-xs font-medium rounded-lg border transition-all',
                      bsp === b
                        ? 'bg-brand-600 text-white border-brand-700'
                        : 'bg-white text-muted-foreground border-border hover:border-brand-300'
                    )}
                  >
                    {BSP_INFO[b].label}
                  </button>
                ))}
              </div>
            </div>

            {/* API Key */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {bspInfo.keyLabel}
              </label>
              <input
                type="password"
                value={settings.whatsapp_api_key}
                onChange={e => setSettings(s => ({ ...s, whatsapp_api_key: e.target.value }))}
                placeholder="Paste your key here"
                className="mt-1.5 w-full px-3 py-2 text-sm border border-border rounded-lg bg-[#F8FAFC] font-mono focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
              <p className="text-[11px] text-muted-foreground mt-1">{bspInfo.keyHint}</p>
            </div>

            {/* WATI URL — only for wati */}
            {bsp === 'wati' && (
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">WATI Server URL</label>
                <input
                  type="url"
                  value={settings.whatsapp_wati_url}
                  onChange={e => setSettings(s => ({ ...s, whatsapp_wati_url: e.target.value }))}
                  placeholder="https://live-server-XXXXX.wati.io"
                  className="mt-1.5 w-full px-3 py-2 text-sm border border-border rounded-lg bg-[#F8FAFC] font-mono focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Found in WATI dashboard → API Settings</p>
              </div>
            )}

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
              <Bell size={14} className="text-brand-700" />
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
            </div>

            <button
              onClick={testSend}
              disabled={testing || !isEnabled}
              title={!isEnabled ? 'Enable WhatsApp notifications first' : undefined}
              className="flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <MessageCircle size={13} />
              {testing ? 'Sending test…' : 'Send a test WhatsApp message to this number'}
            </button>
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
                <Settings size={14} className="text-purple-700" />
              </div>
              <div className="text-left">
                <h2 className="text-sm font-semibold text-brand-950">WhatsApp Template Setup</h2>
                <p className="text-[11px] text-muted-foreground">5 templates to register with your BSP</p>
              </div>
            </div>
            {showTemplates ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
          </button>

          {showTemplates && (
            <div className="border-t border-border divide-y divide-border">
              {REQUIRED_TEMPLATES.map(tpl => (
                <div key={tpl.name} className="px-5 py-3.5">
                  <div className="flex items-start gap-2">
                    <CheckCircle size={12} className="text-green-500 mt-0.5 shrink-0" />
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
                  <AlertCircle size={12} className="text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-amber-800">
                    Templates must be approved by WhatsApp/Meta via your BSP before they can be sent.
                    Approval takes 24–48 hours. Use the exact template names above.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* pg_cron Setup */}
        <section className="bg-white rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold text-brand-950 mb-1 flex items-center gap-2">
            <Settings size={14} className="text-muted-foreground" />
            pg_cron Schedule Setup
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            After deploying edge functions, run these SQL snippets in your Supabase SQL Editor
            to activate the automatic dispatch schedule.
          </p>
          <div className="space-y-2">
            <CodeBlock label="Daily WhatsApp alerts — 9 AM IST (03:30 UTC)" code={`select cron.schedule(
  'whatsapp-notify-dispatch',
  '30 3 * * *',
  $$
  select net.http_post(
    url     := 'https://muxwwvwmephtwghsrzbp.supabase.co/functions/v1/notify-dispatch',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);`} />
            <CodeBlock label="Block escalation — every 4 hours" code={`select cron.schedule(
  'block-escalation',
  '0 */4 * * *',
  $$
  select net.http_post(
    url     := 'https://muxwwvwmephtwghsrzbp.supabase.co/functions/v1/block-escalate',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);`} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Replace <code className="font-mono bg-[#F8FAFC] px-1 rounded">&lt;SERVICE_ROLE_KEY&gt;</code> with your key from
            Supabase → Project Settings → API → service_role.
          </p>
        </section>

      </div>
    </div>
  )
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#F8FAFC] border-b border-border">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <button onClick={copy} className="text-[10px] text-brand-600 hover:text-brand-700">
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="text-[10px] font-mono text-brand-950 p-3 overflow-x-auto leading-relaxed bg-white">{code}</pre>
    </div>
  )
}
