import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ClockBadge } from '@/components/shared/ClockBadge'
import { computeStageClocks, clockBucket } from '@/lib/projectClock'
import { Sym } from '@/components/shared/Sym'
import { useMyProjects, useRecentNotifications, useDirectorStats } from '@/hooks/useDashboard'
import { useAuth } from '@/contexts/AuthContext'
import { IncomingTransfers } from '@/pages/projects/ProjectTransfer'
import { formatDate, formatRupees, daysUntil, cn } from '@/lib/utils'
import { greetWord } from '@/data/dailyThoughts'
import { TaskModal } from '@/pages/tasks/TaskModal'
import { useClients } from '@/hooks/useClients'
import { useProjects } from '@/hooks/useProjects'
import { supabase } from '@/lib/supabase'

// The dashboard is self-contained "Clean Light": it paints its own light canvas
// over the app's dark mesh background and uses explicit light tokens (not the
// glass-panel/text-white theme classes). This keeps the fresh look scoped to this
// page without touching anyone's saved shell theme.
export default function DashboardPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isAdmin = ['super_admin', 'director'].includes(profile?.role ?? '')
  const [creatingTask, setCreatingTask] = useState(false)
  const [showSnapshot, setShowSnapshot] = useState(false)

  const { data: myProjects = [], isLoading: loadingProjects } = useMyProjects()
  const { data: notifications = [], isLoading: loadingNotif } = useRecentNotifications()
  const { data: stats } = useDirectorStats()
  const { data: clients = [] } = useClients()
  const { data: allProjects = [] } = useProjects()
  const { data: staff = [] } = useQuery({
    queryKey: ['profiles', 'staff'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, role')
        .eq('is_active', true)
        .order('name')
      return (data ?? []) as { id: string; name: string; role: string }[]
    },
  })

  const activeProjects = myProjects.filter(p => p.status === 'active')
  const overdue      = activeProjects.filter(p => { const d = daysUntil(p.target_date); return d !== null && d < 0 })
  const dueToday     = activeProjects.filter(p => daysUntil(p.target_date) === 0)
  const dueThisWeek  = activeProjects.filter(p => { const d = daysUntil(p.target_date); return d !== null && d >= 0 && d <= 7 })

  // Dashboard shows only today's or unread notifications
  const todayStr  = new Date().toISOString().split('T')[0]
  const dashNotifs = notifications.filter(n => !n.is_read || n.created_at.startsWith(todayStr)).slice(0, 5)
  const unread = notifications.filter(n => !n.is_read).length

  const firstName = profile?.name?.split(' ')[0] ?? 'there'
  const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
  const summaryParts: string[] = []
  if (dueToday.length) summaryParts.push(`${dueToday.length} due today`)
  if (overdue.length)  summaryParts.push(`${overdue.length} overdue`)
  const summary = summaryParts.join(' · ') || 'nothing overdue — you’re on track'

  return (
    <div className="min-h-full bg-[#EEF2F7] text-[#22324A]">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5 animate-fade-up">

        {/* Greeting header (replaces the shared dark top bar) */}
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-display font-bold text-[#12233B] leading-tight">
              Good {greetWord()}, {firstName}
            </h1>
            <p className="text-sm text-[#5B6B7F] mt-1">{dateStr} · {summary}</p>
          </div>
          <button
            onClick={() => setCreatingTask(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#1E3A5F] hover:bg-[#12233B] text-white text-sm font-medium rounded-xl transition-colors shrink-0"
          >
            <Sym name="add_task" size={15} /> New Task
          </button>
        </header>

        <IncomingTransfers />

        {/* Overdue alert strip */}
        {overdue.length > 0 && (
          <button
            onClick={() => navigate('/projects?due=overdue')}
            className="w-full text-left rounded-xl px-4 sm:px-5 py-3 flex items-center gap-3 bg-[#FEF2F2] border border-[#FECACA] hover:bg-[#FEE2E2] transition-colors"
          >
            <Sym name="warning" size={18} className="text-[#DC2626] shrink-0" />
            <p className="text-sm text-[#7F1D1D] flex-1 min-w-0">
              <strong>{overdue.length} project{overdue.length > 1 ? 's' : ''}</strong> past target date — please follow up.
            </p>
            <span className="text-xs text-[#DC2626] flex items-center gap-1 shrink-0">
              View <Sym name="arrow_forward" size={12} />
            </span>
          </button>
        )}

        {/* Slim stats strip */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon="folder_open" label="My projects" value={myProjects.length} tone="navy"
            onClick={() => navigate('/projects')} />
          <StatCard icon="warning" label="Overdue" value={overdue.length} tone={overdue.length > 0 ? 'red' : 'muted'}
            onClick={() => navigate('/projects?due=overdue')} />
          <StatCard icon="schedule" label="Due this week" value={dueThisWeek.length} tone={dueThisWeek.length > 0 ? 'amber' : 'muted'}
            onClick={() => navigate('/projects?due=week')} />
        </div>

        {/* Business snapshot — admins only, collapsed by default to keep the view clean */}
        {isAdmin && stats && (
          <div className="rounded-xl border border-[#E2E8F1] bg-white shadow-sm overflow-hidden">
            <button
              onClick={() => setShowSnapshot(s => !s)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[#F8FAFC] transition-colors"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-[#12233B]">
                <Sym name="insights" size={15} className="text-[#1E3A5F]" /> Business snapshot
              </span>
              <Sym name={showSnapshot ? 'expand_less' : 'expand_more'} size={18} className="text-[#5B6B7F]" />
            </button>
            {showSnapshot && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 pb-4 pt-1">
                <KpiMini label="Total Active"    value={stats.active}                     sub="projects" />
                <KpiMini label="Active Clients"  value={stats.activeClients}              sub="registered" />
                <KpiMini label="Total Collected" value={formatRupees(stats.totalRevenue)} sub="received" />
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Left: My active projects (the focus) */}
          <div className="lg:col-span-2">
            <SectionHeader title="My Active Projects" count={activeProjects.length} onViewAll={() => navigate('/projects')} />
            {loadingProjects ? (
              <SkeletonList rows={3} />
            ) : activeProjects.length === 0 ? (
              <EmptyState message="No active projects assigned to you." />
            ) : (
              <div className="space-y-2 lg:max-h-[calc(100vh-280px)] lg:overflow-y-auto lg:pr-1">
                {activeProjects.map(p => {
                  const days = daysUntil(p.target_date)
                  const isOverdue = days !== null && days < 0
                  const chips = computeStageClocks(p as any)
                  const bucket = clockBucket(p as any)
                  const cardBg =
                    bucket === 'authority' ? 'bg-blue-50 border-blue-200 hover:border-blue-300' :
                    bucket === 'client'    ? 'bg-amber-50 border-amber-200 hover:border-amber-300' :
                                            'bg-green-50 border-green-200 hover:border-green-300'
                  return (
                    <div
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className={cn('rounded-xl border px-3.5 py-2.5 cursor-pointer hover:shadow-sm transition-all', cardBg)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[11px] text-muted-foreground shrink-0">{p.project_code}</span>
                          {p.is_blocked && (
                            <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">BLOCKED</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {chips.map((chip, i) => (
                            <ClockBadge key={chip.clock + i} clock={chip.clock} since={chip.since}
                              isBlocked={(p.is_blocked ?? false) && i === 0} personName={(p as any).profiles_assigned?.name ?? ''} />
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 mt-1">
                        <p className="text-sm font-medium text-brand-950 truncate">
                          {(p as any).clients?.company_name}
                          {p.service_type ? <span className="text-muted-foreground font-normal"> — {p.service_type}</span> : null}
                        </p>
                        {p.target_date && (
                          <span className={cn(
                            'text-[11px] font-medium shrink-0',
                            isOverdue ? 'text-red-600' : days !== null && days <= 7 ? 'text-amber-600' : 'text-muted-foreground'
                          )}>
                            {isOverdue ? `${Math.abs(days!)}d overdue` : days === 0 ? 'Due today' : `Due ${formatDate(p.target_date)}`}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right: Notifications */}
          <div>
            <SectionHeader title="Notifications" count={unread} countLabel="unread" icon="notifications"
              onViewAll={() => navigate('/notifications')} />
            {loadingNotif ? (
              <SkeletonList rows={3} />
            ) : dashNotifs.length === 0 ? (
              <EmptyState message="No unread notifications." />
            ) : (
              <div className="space-y-1.5">
                {dashNotifs.map(n => (
                  <div
                    key={n.id}
                    onClick={() => navigate('/notifications')}
                    className={cn(
                      'rounded-xl border px-4 py-3 cursor-pointer transition-all bg-white shadow-sm',
                      n.is_read ? 'border-[#E2E8F1] hover:border-[#CBD6E4]' : 'border-[#BFD3EC] bg-[#F2F7FD] hover:border-[#9FBFE4]'
                    )}
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      {!n.is_read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#1E3A5F] shrink-0" />}
                      <div className={cn('flex-1 min-w-0 overflow-hidden', n.is_read && 'ml-3.5')}>
                        <p className="text-xs font-medium text-[#12233B] break-words">{n.title}</p>
                        {n.body && <p className="text-[11px] text-[#5B6B7F] mt-0.5 line-clamp-2 break-words">{n.body}</p>}
                        <p className="text-[10px] text-[#8A98AB] mt-1">{formatDate(n.created_at)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick-add task modal */}
      {creatingTask && (
        <TaskModal
          task={null}
          me={profile?.id ?? ''}
          isAdmin={isAdmin}
          staff={staff}
          projects={allProjects as any}
          clients={clients}
          onClose={() => setCreatingTask(false)}
        />
      )}
    </div>
  )
}

// ── Sub-components (Clean Light) ────────────────────────────────────────────────

function StatCard({ icon, label, value, tone, onClick }: {
  icon: string; label: string; value: number
  tone: 'navy' | 'red' | 'amber' | 'muted'; onClick?: () => void
}) {
  const valueColor = { navy: 'text-[#12233B]', red: 'text-[#DC2626]', amber: 'text-[#C67A12]', muted: 'text-[#12233B]' }[tone]
  const iconColor  = { navy: 'text-[#1E3A5F]', red: 'text-[#DC2626]', amber: 'text-[#C67A12]', muted: 'text-[#94A3B8]' }[tone]
  return (
    <button
      onClick={onClick}
      className="text-left bg-white rounded-xl border border-[#E2E8F1] shadow-sm px-3 py-3.5 hover:shadow-md hover:border-[#CBD6E4] transition-all"
    >
      <Sym name={icon} size={18} fill className={cn('shrink-0', iconColor)} />
      <p className={cn('text-2xl font-display font-bold leading-none mt-2', valueColor)}>{value}</p>
      <p className="text-[11px] font-medium mt-1.5 text-[#5B6B7F] truncate">{label}</p>
    </button>
  )
}

function KpiMini({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="rounded-xl border border-[#E2E8F1] bg-[#F8FAFC] p-3">
      <p className="text-[10px] text-[#5B6B7F] uppercase tracking-wide">{label}</p>
      <p className="text-sm font-bold font-mono mt-1 text-[#12233B]">{value}</p>
      <p className="text-[10px] text-[#8A98AB]">{sub}</p>
    </div>
  )
}

function SectionHeader({ title, count, countLabel = 'total', icon, onViewAll }: {
  title: string; count?: number; countLabel?: string; icon?: string; onViewAll?: () => void
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2 min-w-0">
        {icon && <Sym name={icon} size={15} className="text-[#5B6B7F]" />}
        <h2 className="font-display font-semibold text-[#12233B] text-sm truncate">{title}</h2>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {count !== undefined && (
          <span className="text-[11px] text-[#5B6B7F] bg-[#E9EEF5] border border-[#E2E8F1] px-2 py-0.5 rounded-full">
            {count} {countLabel}
          </span>
        )}
        {onViewAll && (
          <button onClick={onViewAll} className="text-[11px] text-[#5B6B7F] hover:text-[#1E3A5F] transition-colors">
            View all →
          </button>
        )}
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#CBD6E4] bg-white/60 p-8 text-center">
      <p className="text-xs text-[#5B6B7F]">{message}</p>
    </div>
  )
}

function SkeletonList({ rows }: { rows: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 rounded-xl bg-white border border-[#E2E8F1]" />
      ))}
    </div>
  )
}
