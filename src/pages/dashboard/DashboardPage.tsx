import { useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { ClockBadge } from '@/components/shared/ClockBadge'
import { Sym } from '@/components/shared/Sym'
import { useMyProjects, useRecentNotifications } from '@/hooks/useDashboard'
import { useAuth } from '@/contexts/AuthContext'
import { IncomingTransfers } from '@/pages/projects/ProjectTransfer'
import { formatDate, daysUntil, cn } from '@/lib/utils'

export default function DashboardPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { data: myProjects = [], isLoading: loadingProjects } = useMyProjects()
  const { data: notifications = [], isLoading: loadingNotif } = useRecentNotifications()

  const overdue     = myProjects.filter(p => { const d = daysUntil(p.target_date); return d !== null && d < 0 })
  const dueThisWeek = myProjects.filter(p => { const d = daysUntil(p.target_date); return d !== null && d >= 0 && d <= 7 })

  return (
    <div>
      <TopBar title={`Welcome, ${profile?.name?.split(' ')[0] ?? 'there'}`} subtitle="Your workspace" />

      <div className="p-6 space-y-6 animate-fade-up">

        {/* Incoming project transfer requests awaiting my acceptance */}
        <IncomingTransfers />

        {/* Alert strip */}
        {overdue.length > 0 && (
          <div className="glass-panel rounded-xl px-5 py-3 flex items-center gap-3 !bg-red-500/15 !border-red-400/30">
            <Sym name="warning" size={18} className="text-red-300 shrink-0" />
            <p className="text-sm text-white">
              <strong>{overdue.length} project{overdue.length > 1 ? 's' : ''}</strong> past target date — please follow up.
            </p>
          </div>
        )}

        {/* Summary chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Chip icon="folder_open" label="My Projects"   value={myProjects.length}                            color="brand" />
          <Chip icon="warning"     label="Overdue"        value={overdue.length}                               color={overdue.length > 0 ? 'red' : 'gray'} />
          <Chip icon="schedule"    label="Due This Week"  value={dueThisWeek.length}                           color={dueThisWeek.length > 0 ? 'amber' : 'gray'} />
          <Chip icon="block"       label="Blocked"        value={myProjects.filter(p => p.is_blocked).length}  color="gray" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* My Projects */}
          <div className="lg:col-span-2">
            <SectionHeader title="My Active Projects" count={myProjects.length} />
            {loadingProjects ? (
              <SkeletonList rows={3} />
            ) : myProjects.length === 0 ? (
              <EmptyState message="No projects assigned to you." />
            ) : (
              <div className="space-y-2">
                {myProjects.map(p => {
                  const days = daysUntil(p.target_date)
                  const isOverdue = days !== null && days < 0
                  return (
                    <div
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className="glass-panel rounded-xl p-4 cursor-pointer hover:bg-white/[0.18] transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[11px] text-white/55">{p.project_code}</span>
                            {p.is_blocked && (
                              <span className="text-[10px] bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded-full font-medium">BLOCKED</span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-white mt-0.5 truncate">{p.project_name}</p>
                          <p className="text-xs text-white/60 mt-0.5">{(p as any).clients?.company_name}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {p.active_clock && p.clock_switched_at && (
                            <ClockBadge clock={p.active_clock} since={p.clock_switched_at} isBlocked={p.is_blocked ?? false} personName={(p as any).profiles_assigned?.name} />
                          )}
                          {p.target_date && (
                            <span className={cn(
                              'text-[11px] font-medium',
                              isOverdue ? 'text-red-300' : days !== null && days <= 7 ? 'text-warning-amber' : 'text-white/55'
                            )}>
                              {isOverdue ? `${Math.abs(days!)}d overdue` : days === 0 ? 'Due today' : `Due ${formatDate(p.target_date)}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Notifications */}
          <div>
            <SectionHeader
              title="Notifications"
              count={notifications.filter(n => !n.is_read).length}
              countLabel="unread"
              icon="notifications"
            />
            {loadingNotif ? (
              <SkeletonList rows={5} />
            ) : notifications.length === 0 ? (
              <EmptyState message="No notifications yet." />
            ) : (
              <div className="space-y-1.5">
                {notifications.map(n => (
                  <div
                    key={n.id}
                    className={cn(
                      'glass-panel rounded-xl px-4 py-3',
                      !n.is_read && '!border-white/30 !bg-white/[0.16]'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {!n.is_read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-fixed-dim shrink-0" />}
                      <div className={cn('flex-1', n.is_read && 'ml-3.5')}>
                        <p className="text-xs font-medium text-white">{n.title}</p>
                        {n.body && <p className="text-[11px] text-white/60 mt-0.5">{n.body}</p>}
                        <p className="text-[10px] text-white/45 mt-1">{formatDate(n.created_at)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Shared sub-components ───────────────────────────────────────────────────

function Chip({ icon, label, value, color }: {
  icon: string; label: string; value: number;
  color: 'brand' | 'red' | 'amber' | 'gray'
}) {
  const iconColor = {
    brand: 'text-primary-fixed-dim',
    red:   'text-red-300',
    amber: 'text-warning-amber',
    gray:  'text-white/50',
  }[color]
  return (
    <div className="glass-panel-heavy rounded-2xl p-4">
      <Sym name={icon} size={22} fill className={cn('mb-2', iconColor)} />
      <p className="text-2xl font-display font-bold text-white">{value}</p>
      <p className="text-[11px] font-medium mt-0.5 text-white/60">{label}</p>
    </div>
  )
}

function SectionHeader({ title, count, countLabel = 'total', icon }: {
  title: string; count?: number; countLabel?: string; icon?: string
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {icon && <Sym name={icon} size={15} className="text-white/70" />}
        <h2 className="font-display font-semibold text-white text-sm">{title}</h2>
      </div>
      {count !== undefined && (
        <span className="text-[11px] text-white/70 bg-white/10 border border-white/15 px-2 py-0.5 rounded-full">
          {count} {countLabel}
        </span>
      )}
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
