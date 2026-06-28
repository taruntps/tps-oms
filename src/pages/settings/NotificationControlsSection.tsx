import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/shared/Toast'
import { Sym } from '@/components/shared/Sym'
import { cn } from '@/lib/utils'

// ── Notification type catalogue ───────────────────────────────────────────────

export const NOTIF_TYPES = [
  { key: 'stage_overdue',    label: 'Stage Overdue',      desc: 'Project stage passes its due date',        icon: 'alarm',          color: 'text-red-600',    bg: 'bg-red-50' },
  { key: 'payment_overdue',  label: 'Payment Overdue',    desc: 'Outstanding payment is past due',          icon: 'payments',       color: 'text-red-600',    bg: 'bg-red-50' },
  { key: 'license_expiring', label: 'Licence Expiring',   desc: 'FSSAI licence expiring in 7–90 days',      icon: 'badge',          color: 'text-amber-600',  bg: 'bg-amber-50' },
  { key: 'expiry_warning',   label: 'Expiry Warning',     desc: 'General document / deadline expiry',       icon: 'event_busy',     color: 'text-amber-600',  bg: 'bg-amber-50' },
  { key: 'block_request',    label: 'Block Request',      desc: 'Employee requests a project block',        icon: 'front_hand',     color: 'text-blue-600',   bg: 'bg-blue-50' },
  { key: 'block_approved',   label: 'Block Approved',     desc: 'Block request approved by manager',        icon: 'check_circle',   color: 'text-green-600',  bg: 'bg-green-50' },
  { key: 'project_assigned', label: 'Project Assigned',   desc: 'Project assigned / reassigned to user',   icon: 'assignment_ind', color: 'text-brand-600',  bg: 'bg-brand-50' },
  { key: 'query_received',   label: 'Query Received',     desc: 'FSSAI authority query raised on project',  icon: 'fact_check',     color: 'text-purple-600', bg: 'bg-purple-50' },
] as const

export type NotifTypeKey = typeof NOTIF_TYPES[number]['key']

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadReminderSettings() {
  const { data } = await (supabase as any)
    .from('reminder_settings')
    .select('instant_types, email_types')
    .eq('id', true)
    .single()
  return data as { instant_types: string[]; email_types: string[] } | null
}

async function loadAllProfiles() {
  const { data } = await (supabase as any)
    .from('profiles')
    .select('id, name, role, notification_prefs')
    .order('name')
  return (data ?? []) as Array<{ id: string; name: string; role: string; notification_prefs: Record<string, any> }>
}

function Toggle({
  on, onClick, disabled, color = 'bg-brand-600',
}: { on: boolean; onClick: () => void; disabled?: boolean; color?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative w-10 h-5 rounded-full transition-colors shrink-0 disabled:opacity-40',
        on ? color : 'bg-gray-200',
      )}
    >
      <span className={cn(
        'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
        on && 'translate-x-5',
      )} />
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function NotificationControlsSection() {
  const qc = useQueryClient()

  // Global type states
  const [instantTypes, setInstantTypes] = useState<NotifTypeKey[]>([])
  const [emailTypes,   setEmailTypes]   = useState<NotifTypeKey[]>([])
  const [savingGlobal, setSavingGlobal] = useState(false)

  // Per-user state
  const [selectedUserId, setSelectedUserId] = useState('')
  const [userTypes,      setUserTypes]      = useState<NotifTypeKey[] | null>(null) // null = follow global
  const [savingUser,     setSavingUser]     = useState(false)

  // Load global settings
  const { data: remSettings, isLoading: loadingGlobal } = useQuery({
    queryKey: ['reminder_settings_full'],
    queryFn: loadReminderSettings,
    staleTime: 60 * 1000,
  })

  useEffect(() => {
    if (remSettings) {
      setInstantTypes((remSettings.instant_types ?? []) as NotifTypeKey[])
      setEmailTypes((remSettings.email_types   ?? []) as NotifTypeKey[])
    }
  }, [remSettings])

  // Load all profiles
  const { data: profiles = [] } = useQuery({
    queryKey: ['all_profiles_for_notif'],
    queryFn: loadAllProfiles,
    staleTime: 60 * 1000,
  })

  // When user selection changes, initialise userTypes from their saved prefs
  useEffect(() => {
    if (!selectedUserId) { setUserTypes(null); return }
    const p = profiles.find(p => p.id === selectedUserId)
    if (!p) return
    const prefs = (p as any).notification_prefs ?? {}
    setUserTypes(Array.isArray(prefs.types) ? prefs.types as NotifTypeKey[] : null)
  }, [selectedUserId, profiles])

  // ── Global save ──────────────────────────────────────────────────────────────

  async function saveGlobal() {
    setSavingGlobal(true)
    try {
      const { error } = await (supabase as any)
        .from('reminder_settings')
        .update({ instant_types: instantTypes, email_types: emailTypes })
        .eq('id', true)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['reminder_settings_full'] })
      toast.success('Global notification settings saved')
    } catch (e: any) {
      toast.error('Save failed', e.message)
    } finally {
      setSavingGlobal(false)
    }
  }

  // ── Per-user save ────────────────────────────────────────────────────────────

  async function saveUser() {
    if (!selectedUserId) return
    setSavingUser(true)
    try {
      const prefs = userTypes === null ? {} : { types: userTypes }
      const { error } = await (supabase as any)
        .from('profiles')
        .update({ notification_prefs: prefs })
        .eq('id', selectedUserId)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['all_profiles_for_notif'] })
      const name = profiles.find(p => p.id === selectedUserId)?.name ?? 'User'
      toast.success(`Preferences saved for ${name}`)
    } catch (e: any) {
      toast.error('Save failed', e.message)
    } finally {
      setSavingUser(false)
    }
  }

  function toggleInstant(key: NotifTypeKey) {
    setInstantTypes(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  function toggleEmail(key: NotifTypeKey) {
    setEmailTypes(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  function toggleUserType(key: NotifTypeKey) {
    if (userTypes === null) {
      // First customisation: start with all types checked minus this one
      setUserTypes(NOTIF_TYPES.map(t => t.key).filter(k => k !== key))
    } else {
      setUserTypes(prev =>
        prev!.includes(key) ? prev!.filter(k => k !== key) : [...prev!, key]
      )
    }
  }

  const selectedUser = profiles.find(p => p.id === selectedUserId)

  return (
    <section className="bg-white rounded-xl border border-border">

      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center">
          <Sym name="tune" size={14} className="text-purple-700" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-brand-950">Notification Controls</h2>
          <p className="text-[11px] text-muted-foreground">
            Choose which alert types are active and customise per-user delivery
          </p>
        </div>
      </div>

      <div className="p-5 space-y-7">

        {/* ── Part 1: Global type matrix ──────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-brand-950 mb-3">Global Alert Types</p>

          {/* Column headers */}
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 mb-2 pr-1">
            <span />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-center w-16">In-app</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-center w-16">Email</span>
          </div>

          <div className="space-y-1">
            {NOTIF_TYPES.map(t => {
              const inApp  = instantTypes.includes(t.key)
              const inMail = emailTypes.includes(t.key)
              return (
                <div
                  key={t.key}
                  className={cn(
                    'grid grid-cols-[1fr_auto_auto] items-center gap-x-6 px-3 py-2.5 rounded-lg',
                    !inApp && !inMail ? 'opacity-50' : 'hover:bg-[#F8FAFC]',
                  )}
                >
                  {/* Label */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={cn('w-6 h-6 rounded-md flex items-center justify-center shrink-0', t.bg)}>
                      <Sym name={t.icon} size={13} className={t.color} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-brand-950 leading-tight">{t.label}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight truncate">{t.desc}</p>
                    </div>
                  </div>

                  {/* In-app toggle */}
                  <div className="flex justify-center w-16">
                    <Toggle
                      on={inApp}
                      onClick={() => toggleInstant(t.key)}
                      disabled={loadingGlobal}
                      color="bg-brand-600"
                    />
                  </div>

                  {/* Email toggle */}
                  <div className="flex justify-center w-16">
                    <Toggle
                      on={inMail}
                      onClick={() => toggleEmail(t.key)}
                      disabled={loadingGlobal}
                      color="bg-green-500"
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-[11px] text-muted-foreground mt-2 ml-1">
            <strong>In-app</strong> — bell icon + Notifications page. &nbsp;
            <strong>Email</strong> — daily digest &amp; instant email alerts.
          </p>

          <button
            onClick={saveGlobal}
            disabled={savingGlobal || loadingGlobal}
            className="mt-4 w-full py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {savingGlobal ? 'Saving…' : 'Save Global Alert Settings'}
          </button>
        </div>

        <hr className="border-border" />

        {/* ── Part 2: Per-user subscriptions ─────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-brand-950 mb-1">Per-User Subscriptions</p>
          <p className="text-[11px] text-muted-foreground mb-3">
            Override which notification types a specific user receives. By default every user gets all globally enabled types.
          </p>

          {/* User picker */}
          <select
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20 bg-white mb-4"
          >
            <option value="">— Select a user to configure —</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.role?.replace(/_/g, ' ')})
              </option>
            ))}
          </select>

          {selectedUser && (
            <>
              {/* Custom vs default toggle */}
              <div className="flex items-center justify-between mb-3 p-3 bg-[#F8FAFC] rounded-lg border border-border">
                <div>
                  <p className="text-xs font-medium text-brand-950">Custom notification types for {selectedUser.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {userTypes === null
                      ? 'Receiving all globally enabled types (default)'
                      : `${userTypes.length} type${userTypes.length !== 1 ? 's' : ''} selected`}
                  </p>
                </div>
                <Toggle
                  on={userTypes !== null}
                  onClick={() => {
                    if (userTypes !== null) {
                      setUserTypes(null)
                    } else {
                      // Enable custom: start with all types
                      setUserTypes(NOTIF_TYPES.map(t => t.key) as unknown as NotifTypeKey[])
                    }
                  }}
                  color="bg-purple-600"
                />
              </div>

              {/* Type checkboxes — only when custom is on */}
              {userTypes !== null && (
                <div className="space-y-1 mb-4">
                  {NOTIF_TYPES.map(t => {
                    const checked = userTypes.includes(t.key)
                    return (
                      <label
                        key={t.key}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#F8FAFC] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleUserType(t.key)}
                          className="w-4 h-4 rounded border-border text-brand-600 focus:ring-brand-600/20"
                        />
                        <span className={cn('w-6 h-6 rounded-md flex items-center justify-center shrink-0', t.bg)}>
                          <Sym name={t.icon} size={13} className={t.color} />
                        </span>
                        <div>
                          <p className="text-xs font-medium text-brand-950">{t.label}</p>
                          <p className="text-[10px] text-muted-foreground">{t.desc}</p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}

              <button
                onClick={saveUser}
                disabled={savingUser}
                className="w-full py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {savingUser ? 'Saving…' : `Save for ${selectedUser.name}`}
              </button>
            </>
          )}
        </div>

      </div>
    </section>
  )
}
