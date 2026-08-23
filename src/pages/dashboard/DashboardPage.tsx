import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { TopBar } from '@/components/layout/TopBar'
import { ClockBadge } from '@/components/shared/ClockBadge'
import { computeStageClocks, clockBucket } from '@/lib/projectClock'
import { Sym } from '@/components/shared/Sym'
import { useMyProjects, useDirectorStats } from '@/hooks/useDashboard'
import { useAuth } from '@/contexts/AuthContext'
import { IncomingTransfers } from '@/pages/projects/ProjectTransfer'
import { formatDate, formatRupees, daysUntil, cn } from '@/lib/utils'
import { greetWord } from '@/data/dailyThoughts'
import { TaskModal } from '@/pages/tasks/TaskModal'
import { useClients } from '@/hooks/useClients'
import { useProjects } from '@/hooks/useProjects'
import { supabase } from '@/lib/supabase'

// Decluttered dashboard on the app's glass theme (consistent with every other page).
// Uses the standard TopBar (name / photo / bell / sign-out). Pending Payments, Today's
// Punches and the in-body Notifications panel were removed (the bell covers alerts);
// the admin business KPIs live in a collapsible strip.
export default function DashboardPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isAdmin = ['super_admin', 'director'].includes(profile?.role ?? '')
  const [creatingTask, setCreatingTask] = useState(false)
  const [showSnapshot, setShowSnapshot] = useState(false)

  const { data: myProjects = [], isLoading: loadingProjects } = useMyProjects()
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

  const firstName = profile?.name?.split(' ')[0] ?? 'there'
  const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
  const summaryParts: string[] = []
  if (dueToday.length) summaryParts.push(`${dueToday.length} due today`)
  if (overdue.length)  summaryParts.push(`${overdue.length} overdue`)
  const summary = summaryParts.join(' · ') || 'nothing overdue — you’re on track'

  return (
    <div>
      <TopBar title={`Good ${greetWord()}, ${firstName}`} subtitle={`${dateStr} · ${summary}`} />

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

        {/* Overdue alert strip — click to open the overdue-filtered project list */}
        {overdue.length > 0 && (
          <div
            onClick={() => navigate('/projects?due=overdue')}
            className="glass-panel rounded-xl px-5 py-3 flex items-center gap-3 !bg-red-500/15 !border-red-400/30 cursor-pointer hover:!bg-red-500/25 transition-all"
          >
            <Sym name="warning" size={18} className="text-red-300 shrink-0" />
            <p className="text-sm text-white flex-1">
              <strong>{overdue.length} project{overdue.length > 1 ? 's' : ''}</strong> past target date — please follow up.
            </p>
            <span className="text-xs text-red-200 flex items-center gap-1 shrink-0">
              View <Sym name="arrow_forward" size={12} />
            </span>
          </div>
        )}

        {/* Slim stats strip — three cells */}
        <div className="grid grid-cols-3 glass-panel-heavy rounded-2xl overflow-hidden">
          <StatCell icon="folder_open" label="My Projects"   value={myProjects.length}  color="brand"
            onClick={() => navigate('/projects')} border />
          <StatCell icon="warning"     label="Overdue"       value={overdue.length}     color={overdue.length > 0 ? 'red' : 'gray'}
            onClick={() => navigate('/projects?due=overdue')} border />
          <StatCell icon="schedule"    label="Due This Week" value={dueThisWeek.length} color={dueThisWeek.length > 0 ? 'amber' : 'gray'}
            onClick={() => navigate('/projects?due=week')} />
        </div>

        {/* Business snapshot — admins only, collapsed by default */}
        {isAdmin && stats && (
          <div className="glass-panel rounded-xl overflow-hidden">
            <button
              onClick={() => setShowSnapshot(s => !s)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.07] transition-all"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-white">
                <Sym name="insights" size={15} className="text-primary-fixed-dim" /> Business snapshot
              </span>
              <Sym name={showSnapshot ? 'expand_less' : 'expand_more'} size={18} className="text-white/60" />
            </button>
            {showSnapshot && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 pb-4 pt-1">
                <KpiMini label="Total Active"    value={stats.active}                     sub="projects" />
                <KpiMini label="Active Clients"  value={stats.activeClients}              sub="registered" />
                <KpiMini label="Total Collected" value={formatRupees(stats.totalRevenue)} sub="received" isRupee />
              </div>
            )}
          </div>
        )}

        {/* My Active Projects — the focus, full width */}
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
            <div className="space-y-2 lg:max-h-[calc(100vh-300px)] lg:overflow-y-auto lg:pr-1">
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
                    {/* Line 1: code (left) · clock (right) */}
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
                    {/* Line 2: company (left) · due (right) */}
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
        border && 'border-r border-white/10'
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
