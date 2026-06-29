import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { TopBar } from '@/components/layout/TopBar'
import { ClockBadge } from '@/components/shared/ClockBadge'
import { computeStageClocks } from '@/lib/projectClock'
import { Sym } from '@/components/shared/Sym'
import {
  useMyProjects, useRecentNotifications, useDirectorStats,
  useTodayPunches, usePendingPayments,
} from '@/hooks/useDashboard'
import { useAuth } from '@/contexts/AuthContext'
import { IncomingTransfers } from '@/pages/projects/ProjectTransfer'
import { formatDate, formatRupees, daysUntil, cn } from '@/lib/utils'
import { useTheme } from '@/hooks/useTheme'
import { TaskModal } from '@/pages/tasks/TaskModal'
import { useClients } from '@/hooks/useClients'
import { useProjects } from '@/hooks/useProjects'
import { supabase } from '@/lib/supabase'

export default function DashboardPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isAdmin = ['super_admin', 'director'].includes(profile?.role ?? '')
  // Who may open payment details from the dashboard pending-payments list.
  const canViewPayments = ['super_admin', 'director', 'manager', 'accounts'].includes(profile?.role ?? '')
  useTheme()  // applies the saved/default dashboard theme (switcher removed)
  const [creatingTask, setCreatingTask] = useState(false)

  const { data: myProjects = [], isLoading: loadingProjects } = useMyProjects()
  const { data: notifications = [], isLoading: loadingNotif } = useRecentNotifications()
  const { data: stats } = useDirectorStats()
  const { data: todayPunches = [] } = useTodayPunches()
  const { data: pendingPayments = [] } = usePendingPayments()
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
  const dueThisWeek  = activeProjects.filter(p => { const d = daysUntil(p.target_date); return d !== null && d >= 0 && d <= 7 })
  const blocked      = myProjects.filter(p => p.is_blocked)

  // Dashboard shows only today's or unread notifications
  const todayStr  = new Date().toISOString().split('T')[0]
  const dashNotifs = notifications.filter(n => !n.is_read || n.created_at.startsWith(todayStr)).slice(0, 5)

  return (
    <div>
      <TopBar title={`Welcome, ${profile?.name?.split(' ')[0] ?? 'there'}`} subtitle="Your workspace" />

      <div className="p-6 space-y-5 animate-fade-up">
        <IncomingTransfers />

        {/* New Task */}
        <div className="flex items-center justify-end">
          <button
            onClick={() => setCreatingTask(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 border border-white/20 text-white text-sm font-medium rounded-xl transition-all"
          >
            <Sym name="add_task" size={15} /> New Task
          </button>
        </div>

        {/* Overdue alert strip */}
        {overdue.length > 0 && (
          <div className="glass-panel rounded-xl px-5 py-3 flex items-center gap-3 !bg-red-500/15 !border-red-400/30">
            <Sym name="warning" size={18} className="text-red-300 shrink-0" />
            <p className="text-sm text-white">
              <strong>{overdue.length} project{overdue.length > 1 ? 's' : ''}</strong> past target date — please follow up.
            </p>
          </div>
        )}

        {/* Summary stats — one box split into four */}
        <div className="grid grid-cols-2 sm:grid-cols-4 glass-panel-heavy rounded-2xl overflow-hidden">
          <StatCell icon="folder_open" label="My Projects"   value={myProjects.length}  color="brand"
            onClick={() => navigate('/projects')} border />
          <StatCell icon="warning"     label="Overdue"       value={overdue.length}     color={overdue.length > 0 ? 'red' : 'gray'}
            onClick={() => navigate('/projects?due=overdue')} border />
          <StatCell icon="schedule"    label="Due This Week" value={dueThisWeek.length} color={dueThisWeek.length > 0 ? 'amber' : 'gray'}
            onClick={() => navigate('/projects?due=week')} border />
          <StatCell icon="block"       label="Blocked"       value={blocked.length}     color="gray"
            onClick={() => navigate('/projects?blocked=1')} />
        </div>

        {/* Director KPIs — admin only */}
        {isAdmin && stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiMini label="Total Active"    value={stats.active}                       sub="projects" />
            <KpiMini label="Active Clients"  value={stats.activeClients}                sub="registered" />
            <KpiMini label="Total Collected" value={formatRupees(stats.totalRevenue)}   sub="received" isRupee />
            <KpiMini label="Pending Payment" value={formatRupees(stats.pendingPayment)} sub="outstanding" warn={stats.pendingPayment > 0} isRupee />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Left: Active projects + Pie */}
          <div className="lg:col-span-2 space-y-5">

            <div>
              <SectionHeader
                title="My Active Projects"
                count={activeProjects.length}
                onViewAll={() => navigate('/projects')}
              />
              {loadingProjects ? (
                <SkeletonList rows={3} />
              ) : activeProjects.length === 0 ? (
                <EmptyState message="No active projects assigned to you." />
              ) : (
                <div className="space-y-2 max-h-[calc(100vh-320px)] min-h-[220px] overflow-y-auto pr-1">
                  {activeProjects.map(p => {
                    const days = daysUntil(p.target_date)
                    const isOverdue = days !== null && days < 0
                    const chips = computeStageClocks(p as any)
                    return (
                      <div
                        key={p.id}
                        onClick={() => navigate(`/projects/${p.id}`)}
                        className="glass-panel rounded-xl px-3.5 py-2.5 cursor-pointer hover:bg-white/[0.18] transition-all"
                      >
                        {/* Line 1: code + status (left) · clock (right) */}
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-[11px] text-white/55 shrink-0">{p.project_code}</span>
                            {p.is_blocked && (
                              <span className="text-[10px] bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded-full font-medium shrink-0">BLOCKED</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {chips.map((chip, i) => (
                              <ClockBadge key={chip.clock + i} clock={chip.clock} since={chip.since}
                                isBlocked={(p.is_blocked ?? false) && i === 0} personName={(p as any).profiles_assigned?.name ?? ''} />
                            ))}
                          </div>
                        </div>
                        {/* Line 2: company (left) · due (right) */}
                        <div className="flex items-center justify-between gap-3 mt-1">
                          <p className="text-sm font-medium text-white truncate">
                            {(p as any).clients?.company_name}
                            {p.service_type ? <span className="text-white/55 font-normal"> — {p.service_type}</span> : null}
                          </p>
                          {p.target_date && (
                            <span className={cn(
                              'text-[11px] font-medium shrink-0',
                              isOverdue ? 'text-red-300' : days !== null && days <= 7 ? 'text-warning-amber' : 'text-white/55'
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

          </div>

          {/* Right: Notifications + Punches + Pending Payments */}
          <div className="space-y-5">

            {/* Notifications */}
            <div>
              <SectionHeader
                title="Notifications"
                count={notifications.filter(n => !n.is_read).length}
                countLabel="unread"
                icon="notifications"
                onViewAll={() => navigate('/notifications')}
              />
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
                        'glass-panel rounded-xl px-4 py-3 cursor-pointer hover:bg-white/[0.15] transition-all',
                        !n.is_read && '!border-white/30 !bg-white/[0.16]'
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {!n.is_read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-fixed-dim shrink-0" />}
                        <div className={cn('flex-1', n.is_read && 'ml-3.5')}>
                          <p className="text-xs font-medium text-white">{n.title}</p>
                          {n.body && <p className="text-[11px] text-white/60 mt-0.5 truncate">{n.body}</p>}
                          <p className="text-[10px] text-white/45 mt-1">{formatDate(n.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Today's Punches */}
            {todayPunches.length > 0 && (
              <div>
                <SectionHeader title="Today's Punches" count={todayPunches.length} icon="fingerprint" />
                <div className="space-y-1.5">
                  {todayPunches.slice(0, 6).map((punch: any) => (
                    <div key={punch.id} className="glass-panel rounded-xl px-4 py-2.5 flex items-center justify-between">
                      <div>
                        {isAdmin && (
                          <p className="text-xs font-medium text-white">{punch.profiles?.name ?? '—'}</p>
                        )}
                        <p className="text-[11px] text-white/60">
                          {new Date(punch.punch_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className={cn(
                        'text-[10px] px-2 py-0.5 rounded-full font-medium',
                        punch.punch_type === 'in' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                      )}>
                        {punch.punch_type === 'in' ? 'IN' : 'OUT'}
                      </span>
                    </div>
                  ))}
                  {todayPunches.length > 6 && (
                    <button onClick={() => navigate('/attendance')} className="w-full glass-panel rounded-xl py-2 text-xs text-white/60 hover:text-white hover:bg-white/10 transition-all">
                      View all {todayPunches.length} punches →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Pending Payments */}
            {pendingPayments.length > 0 && (
              <div>
                <SectionHeader title="Pending Payments" count={pendingPayments.length} icon="payments" />
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                  {pendingPayments.map((p: any) => {
                    const isOverduePayment = p.completed_date && new Date(p.completed_date) < new Date()
                    const loc = [p.clients?.city, p.clients?.state].filter(Boolean).join(', ')
                    return (
                      <div
                        key={p.id}
                        onClick={canViewPayments ? () => navigate(`/projects/${p.id}?tab=payments`) : undefined}
                        className={cn(
                          'glass-panel rounded-xl px-4 py-2.5 transition-all',
                          canViewPayments && 'cursor-pointer hover:bg-white/[0.15]',
                          isOverduePayment && '!border-red-400/30 !bg-red-500/10'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">{p.project_name}</p>
                            <p className="text-[10px] text-white/55 truncate">
                              {p.clients?.company_name}{loc ? ` · ${loc}` : ''}
                            </p>
                          </div>
                          {isOverduePayment && (
                            <p className="text-[9px] text-red-400 shrink-0">OVERDUE</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
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

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCell({ icon, label, value, color, onClick, border }: {
  icon: string; label: string; value: number
  color: 'brand' | 'red' | 'amber' | 'gray'
  onClick?: () => void; border?: boolean
}) {
  const iconColor = { brand: 'text-primary-fixed-dim', red: 'text-red-300', amber: 'text-warning-amber', gray: 'text-white/50' }[color]
  return (
    <button
      onClick={onClick}
      className={cn(
        'text-left px-4 py-3.5 flex items-center gap-3 hover:bg-white/[0.07] transition-all',
        'border-b border-white/10 sm:border-b-0',
        border && 'sm:border-r border-white/10'
      )}
    >
      <Sym name={icon} size={20} fill className={cn('shrink-0', iconColor)} />
      <div className="min-w-0">
        <p className="text-2xl font-display font-bold text-white leading-none">{value}</p>
        <p className="text-[11px] font-medium mt-1.5 text-white/60 truncate">{label}</p>
      </div>
    </button>
  )
}

function KpiMini({ label, value, sub, warn }: {
  label: string; value: string | number; sub: string; isRupee?: boolean; warn?: boolean
}) {
  return (
    <div className="glass-panel rounded-xl p-3">
      <p className="text-[10px] text-white/55 uppercase tracking-wide">{label}</p>
      <p className={cn('text-sm font-bold font-mono mt-1', warn ? 'text-warning-amber' : 'text-white')}>{value}</p>
      <p className="text-[10px] text-white/40">{sub}</p>
    </div>
  )
}

function SectionHeader({ title, count, countLabel = 'total', icon, onViewAll }: {
  title: string; count?: number; countLabel?: string; icon?: string; onViewAll?: () => void
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {icon && <Sym name={icon} size={15} className="text-white/70" />}
        <h2 className="font-display font-semibold text-white text-sm">{title}</h2>
      </div>
      <div className="flex items-center gap-2">
        {count !== undefined && (
          <span className="text-[11px] text-white/70 bg-white/10 border border-white/15 px-2 py-0.5 rounded-full">
            {count} {countLabel}
          </span>
        )}
        {onViewAll && (
          <button onClick={onViewAll} className="text-[11px] text-white/55 hover:text-white transition-colors">
            View all →
          </button>
        )}
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="glass-panel rounded-xl border-dashed !border-white/20 p-8 text-center">
      <p className="text-xs text-white/60">{message}</p>
    </div>
  )
}

function SkeletonList({ rows }: { rows: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 glass-panel rounded-xl" />
      ))}
    </div>
  )
}
