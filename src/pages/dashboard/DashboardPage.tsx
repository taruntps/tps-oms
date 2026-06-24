import { useNavigate } from 'react-router-dom'
import { FolderKanban, AlertTriangle, Clock, CheckCircle2, Bell } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { ClockBadge } from '@/components/shared/ClockBadge'
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
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 flex items-center gap-3">
            <AlertTriangle size={16} className="text-red-600 shrink-0" />
            <p className="text-sm text-red-800">
              <strong>{overdue.length} project{overdue.length > 1 ? 's' : ''}</strong> past target date — please follow up.
            </p>
          </div>
        )}

        {/* Summary chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Chip icon={FolderKanban} label="My Projects"   value={myProjects.length}                        color="brand" />
          <Chip icon={AlertTriangle} label="Overdue"       value={overdue.length}                           color={overdue.length > 0 ? 'red' : 'gray'} />
          <Chip icon={Clock}         label="Due This Week" value={dueThisWeek.length}                       color={dueThisWeek.length > 0 ? 'amber' : 'gray'} />
          <Chip icon={CheckCircle2}  label="Blocked"       value={myProjects.filter(p => p.is_blocked).length} color="gray" />
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
                      className="bg-white rounded-xl border border-border p-4 cursor-pointer hover:border-brand-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[11px] text-muted-foreground">{p.project_code}</span>
                            {p.is_blocked && (
                              <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">BLOCKED</span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-brand-950 mt-0.5 truncate">{p.project_name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{(p as any).clients?.company_name}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {p.active_clock && p.clock_switched_at && (
                            <ClockBadge clock={p.active_clock} since={p.clock_switched_at} isBlocked={p.is_blocked ?? false} />
                          )}
                          {p.target_date && (
                            <span className={cn(
                              'text-[11px] font-medium',
                              isOverdue ? 'text-red-600' : days !== null && days <= 7 ? 'text-amber-600' : 'text-muted-foreground'
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
              icon={Bell}
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
                      'bg-white rounded-xl border px-4 py-3',
                      n.is_read ? 'border-border' : 'border-brand-200 bg-brand-50/40'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {!n.is_read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-600 shrink-0" />}
                      <div className={cn('flex-1', n.is_read && 'ml-3.5')}>
                        <p className="text-xs font-medium text-brand-950">{n.title}</p>
                        {n.body && <p className="text-[11px] text-muted-foreground mt-0.5">{n.body}</p>}
                        <p className="text-[10px] text-muted-foreground/70 mt-1">{formatDate(n.created_at)}</p>
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

function Chip({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: number;
  color: 'brand' | 'red' | 'amber' | 'gray'
}) {
  const cls = {
    brand: 'bg-brand-50 border-brand-200 text-brand-600',
    red:   'bg-red-50 border-red-200 text-red-600',
    amber: 'bg-amber-50 border-amber-200 text-amber-600',
    gray:  'bg-[#F8FAFC] border-border text-muted-foreground',
  }[color]
  return (
    <div className={cn('rounded-xl border p-4', cls)}>
      <Icon size={18} className="mb-2" />
      <p className="text-2xl font-display font-bold">{value}</p>
      <p className="text-[11px] font-medium mt-0.5 opacity-80">{label}</p>
    </div>
  )
}

function SectionHeader({ title, count, countLabel = 'total', icon: Icon }: {
  title: string; count?: number; countLabel?: string; icon?: React.ElementType
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={14} className="text-muted-foreground" />}
        <h2 className="font-display font-semibold text-brand-950 text-sm">{title}</h2>
      </div>
      {count !== undefined && (
        <span className="text-[11px] text-muted-foreground bg-[#F8FAFC] border border-border px-2 py-0.5 rounded-full">
          {count} {countLabel}
        </span>
      )}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-white rounded-xl border border-dashed border-border p-8 text-center">
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  )
}

function SkeletonList({ rows }: { rows: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 bg-white rounded-xl border border-border" />
      ))}
    </div>
  )
}
