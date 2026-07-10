import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Sym } from '@/components/shared/Sym'
import { TopBar } from '@/components/layout/TopBar'
import { ClockBadge } from '@/components/shared/ClockBadge'
import { computeStageClocks, isAuthorityOnly, clockBucket } from '@/lib/projectClock'
import { SERVICE_TYPES } from '@/data/india'
import { ProjectForm } from './ProjectForm'
import { useProjects } from '@/hooks/useProjects'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate, cn } from '@/lib/utils'
import { toast } from '@/components/shared/Toast'
import type { Database } from '@/types/database'

type ProjectStatus = Database['public']['Enums']['project_status']
type FilterValue = 'all' | 'pending' | 'tps' | 'with_client' | 'authority' | 'blocked' | 'on_hold' | 'completed' | 'cancelled'

const STATUS_FILTERS: { label: string; value: FilterValue }[] = [
  { label: 'Active',    value: 'pending' },    // active, not blocked (TPS + Client + FSSAI)
  { label: 'TPS',       value: 'tps' },         // active, at least one employee-clock stage
  { label: 'Client',    value: 'with_client' }, // active, at least one client-clock stage
  { label: 'FSSAI',     value: 'authority' },   // active, solely waiting on authority
  { label: 'Blocked',   value: 'blocked' },     // active but blocked — clock stopped
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'All',       value: 'all' },
]

// Blocked projects live only in the Blocked tab (and All) — never in the
// Active/TPS/Client/FSSAI buckets, since their clock is stopped.
function matchesFilter(p: any, f: FilterValue): boolean {
  switch (f) {
    case 'all':         return true
    case 'blocked':     return p.status === 'active' && !!p.is_blocked
    case 'pending':     return p.status === 'active' && !p.is_blocked
    case 'tps':         return p.status === 'active' && !p.is_blocked && computeStageClocks(p).some((c: any) => c.clock === 'employee')
    case 'with_client': return p.status === 'active' && !p.is_blocked && computeStageClocks(p).some((c: any) => c.clock === 'client')
    case 'authority':   return p.status === 'active' && !p.is_blocked && isAuthorityOnly(p)
    default:            return p.status === f
  }
}

// Distinct colour per project (service) type so the type reads at a glance.
const PROJECT_TYPE_BADGE: Record<string, string> = {
  'New Application': 'bg-blue-50 text-blue-700 border-blue-200',
  'Renewal':        'bg-green-50 text-green-700 border-green-200',
  'Modification':   'bg-amber-50 text-amber-700 border-amber-200',
  'Annual Return':  'bg-purple-50 text-purple-700 border-purple-200',
  'Form II':        'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Artwork':        'bg-pink-50 text-pink-700 border-pink-200',
  'Claim Check':    'bg-teal-50 text-teal-700 border-teal-200',
}
const projectTypeBadge = (t?: string | null) =>
  (t && PROJECT_TYPE_BADGE[t]) || 'bg-gray-50 text-gray-600 border-gray-200'

const STATUS_BADGE: Record<ProjectStatus, string> = {
  active:    'bg-green-100 text-green-700',
  on_hold:   'bg-amber-100 text-amber-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-700',
  archived:  'bg-gray-100 text-gray-500',
}

export default function ProjectsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { profile } = useAuth()
  const { data: projects = [], isLoading } = useProjects()
  const [showForm, setShowForm] = useState(false)

  // Filters live in the URL so "Back to Projects" (and browser back / refresh)
  // restores exactly the view the user left — tab, scope, type and search.
  const search       = searchParams.get('q') ?? ''
  const statusFilter = (searchParams.get('status') as FilterValue) ?? 'pending'
  const typeFilter   = searchParams.get('type') ?? 'all'
  const scope        = (searchParams.get('scope') as 'mine' | 'all') ?? 'mine'

  const setParam = (key: string, value: string, defaultVal: string) =>
    setSearchParams(prev => {
      const p = new URLSearchParams(prev)
      if (value === defaultVal) p.delete(key); else p.set(key, value)
      return p
    }, { replace: true })

  const setSearch       = (v: string) => setParam('q', v, '')
  const setTypeFilter   = (v: string) => setParam('type', v, 'all')
  const setScope        = (v: 'mine' | 'all') => setParam('scope', v, 'mine')
  // Clicking a status tab also clears the dashboard chip filters (due/blocked),
  // otherwise "overdue AND <tab>" silently shows nothing.
  const setStatusFilter = (v: FilterValue) => setSearchParams(prev => {
    const p = new URLSearchParams(prev)
    if (v === 'pending') p.delete('status'); else p.set('status', v)
    p.delete('due'); p.delete('blocked')
    return p
  }, { replace: true })

  // URL-driven filters from dashboard chips
  const dueParam     = searchParams.get('due')      // 'week' | 'overdue'
  const blockedParam = searchParams.get('blocked')  // '1'

  // Visibility flag gates the "Overall" view; everyone has "My Projects".
  const canViewAll = profile?.role === 'super_admin'
    || profile?.role === 'director'
    || (profile as any)?.can_view_all_projects === true

  const canAssign = profile?.role === 'super_admin'
    || profile?.role === 'director'
    || (profile as any)?.can_assign === true

  const isMine = (p: typeof projects[number]) =>
    p.assigned_to === profile?.id || p.manager_id === profile?.id

  const mineCount = projects.filter(isMine).length
  // Without the Visibility flag, RLS only returns own projects anyway — so "all"
  // collapses to "mine". Force scope to 'mine' when the user can't view all.
  const effectiveScope = canViewAll ? scope : 'mine'
  const scoped = effectiveScope === 'mine' ? projects.filter(isMine) : projects

  const todayMs = Date.now()

  // Per-tab counts (respect scope, ignore search/type so numbers stay stable)
  const filterCounts = Object.fromEntries(
    STATUS_FILTERS.map(f => [f.value, scoped.filter(p => matchesFilter(p, f.value)).length])
  ) as Record<FilterValue, number>

  const filtered = scoped.filter(p => {
    const matchStatus = matchesFilter(p, statusFilter)
    const matchType = typeFilter === 'all' || p.service_type === typeFilter
    const q = search.toLowerCase()
    const matchSearch = !q ||
      p.project_code?.toLowerCase().includes(q) ||
      p.project_name?.toLowerCase().includes(q) ||
      p.clients?.company_name?.toLowerCase().includes(q) ||
      p.service_type?.toLowerCase().includes(q)
    // Dashboard chip filters
    if (dueParam === 'week') {
      if (!p.target_date || p.status === 'completed' || p.status === 'cancelled') return false
      const diff = (new Date(p.target_date).getTime() - todayMs) / 86_400_000
      if (diff < 0 || diff > 7) return false
    }
    if (dueParam === 'overdue') {
      if (!p.target_date || p.status === 'completed' || p.status === 'cancelled') return false
      const diff = (new Date(p.target_date).getTime() - todayMs) / 86_400_000
      if (diff >= 0) return false
    }
    if (blockedParam === '1' && !p.is_blocked) return false
    return matchStatus && matchSearch && matchType
  })

  return (
    <div>
      <TopBar
        title="Projects"
        subtitle={effectiveScope === 'mine' ? `${mineCount} assigned to you` : `${projects.length} total`}
      />

      <div className="p-6 animate-fade-up space-y-5">
        {/* Scope: My Projects vs Overall (Overall only if Visibility flag) */}
        <div className="inline-flex rounded-lg border border-white/15 bg-white/10 p-1 text-sm">
          <button
            onClick={() => setScope('mine')}
            className={cn(
              'px-4 py-1.5 rounded-md font-medium transition-all',
              effectiveScope === 'mine' ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'
            )}
          >
            My Projects <span className="text-xs text-white/45">({mineCount})</span>
          </button>
          {canViewAll && (
            <button
              onClick={() => setScope('all')}
              className={cn(
                'px-4 py-1.5 rounded-md font-medium transition-all',
                effectiveScope === 'all' ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'
              )}
            >
              Overall <span className="text-xs text-white/45">({projects.length})</span>
            </button>
          )}
        </div>

        {effectiveScope === 'all' && (
          <p className="text-[11px] text-white/60 -mt-2">
            Viewing all projects (read-only) — you can only edit projects assigned to you.
          </p>
        )}

        {/* Active quick-filter banner from dashboard chip */}
        {(dueParam || blockedParam) && (
          <div className="flex items-center gap-2 bg-white/15 border border-white/20 rounded-lg px-4 py-2 text-sm text-white">
            <Sym name="filter_list" size={14} className="text-white/70" />
            <span className="flex-1">
              {dueParam === 'week'    && 'Showing projects due within 7 days'}
              {dueParam === 'overdue' && 'Showing overdue projects'}
              {blockedParam === '1'   && 'Showing blocked projects'}
            </span>
            <button onClick={() => navigate('/projects')} className="text-white/60 hover:text-white text-xs underline">
              Clear filter
            </button>
          </div>
        )}

        {/* Search + type + new */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Sym name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by code, project or client name…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
            />
          </div>

          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
          >
            <option value="all">All types</option>
            {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {canAssign && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 shrink-0"
            >
              <Sym name="add" size={16} />
              New Project
            </button>
          )}
        </div>

        {/* Status / clock filter pills */}
        <div className="flex flex-wrap gap-1 bg-white/10 p-1 rounded-lg border border-white/15 w-fit">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-all',
                statusFilter === f.value ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white',
                f.value === 'blocked' && filterCounts.blocked > 0 && statusFilter !== 'blocked' && 'text-red-300 hover:text-red-200'
              )}
            >
              {f.label} <span className="opacity-60">({filterCounts[f.value]})</span>
            </button>
          ))}
        </div>

        {/* Project list */}
        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1,2,3].map(i => <div key={i} className="h-24 glass-panel rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-panel rounded-xl border-dashed !border-white/20 p-12 text-center">
            <Sym name="folder_open" size={34} className="mx-auto text-white/40 mb-3" />
            <p className="text-sm text-white/60">No projects found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(p => {
              const chips = computeStageClocks(p as any)
              const execFirst = (p as any).profiles_assigned?.name?.trim().split(/\s+/)[0]
              const loc = [(p.clients as any)?.city, (p.clients as any)?.state].filter(Boolean).join(', ')
              const withSomeoneElse = chips.length > 0 && chips.every(c => c.clock !== 'employee')
              const cardBg = (() => {
                if (p.status === 'on_hold')   return 'bg-slate-50 border-slate-200 hover:border-slate-300'
                if (p.status === 'completed') return 'bg-teal-50 border-teal-200 hover:border-teal-300'
                if (p.status === 'cancelled') return 'bg-rose-50 border-rose-200 hover:border-rose-300'
                if (p.status !== 'active')    return 'bg-white border-border hover:border-brand-300'
                const bucket = clockBucket(p as any)
                if (bucket === 'authority')   return 'bg-blue-50 border-blue-200 hover:border-blue-300'
                if (bucket === 'client')      return 'bg-amber-50 border-amber-200 hover:border-amber-300'
                return 'bg-green-50 border-green-200 hover:border-green-300'
              })()
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/projects/${p.id}`, { state: { fromSearch: window.location.search } })}
                  className={cn('rounded-xl border px-4 py-3 cursor-pointer hover:shadow-sm transition-all', cardBg)}
                >
                  {/* Line 1: code + status (left) · clock (right) */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[11px] text-muted-foreground bg-[#F8FAFC] border border-border px-1.5 py-0.5 rounded shrink-0">
                        {p.project_code}
                      </span>
                      {p.is_blocked && p.status === 'active' ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-red-600 text-white shrink-0">BLOCKED</span>
                      ) : (
                        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium capitalize shrink-0', STATUS_BADGE[p.status as ProjectStatus])}>
                          {p.status?.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {p.status === 'active' && chips.map((chip, i) => (
                        <ClockBadge key={chip.clock + i} clock={chip.clock} since={chip.since}
                          isBlocked={(p.is_blocked ?? false) && i === 0} personName={(p as any).profiles_assigned?.name}
                          pausedMinutes={(p as any).blocked_minutes_total ?? 0}
                          blockStartedAt={(p as any).block_started_at} />
                      ))}
                    </div>
                  </div>

                  {/* Line 2: company name — its own full-width line so it never gets squeezed */}
                  <p className="text-sm font-semibold text-brand-950 mt-1.5 truncate">
                    {p.clients?.company_name}
                  </p>

                  {/* Line 3: type · app-ref · location (left, wraps) · due (right) */}
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1 text-[11px] text-muted-foreground">
                    {p.service_type && (
                      <span className={cn('text-[10px] border px-1.5 py-0.5 rounded font-medium', projectTypeBadge(p.service_type))}>
                        {p.service_type}
                      </span>
                    )}
                    {(p as any).app_ref_no && (
                      <span
                        onClick={e => {
                          e.stopPropagation()
                          navigator.clipboard.writeText((p as any).app_ref_no)
                          toast.success('Copied!', (p as any).app_ref_no)
                        }}
                        onDoubleClick={e => {
                          e.stopPropagation()
                          window.open('https://foscos.fssai.gov.in/view-application', '_blank')
                        }}
                        className="text-[10px] font-mono text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded cursor-pointer hover:bg-blue-100 select-none"
                        title="Click to copy · Double-click to open FSSAI"
                      >
                        #{(p as any).app_ref_no}
                      </span>
                    )}
                    {loc && <span>📍 {loc}</span>}
                    {withSomeoneElse && execFirst && <span>· {execFirst}</span>}
                    {p.target_date && <span className="ml-auto shrink-0">Due {formatDate(p.target_date)}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showForm && <ProjectForm onClose={() => setShowForm(false)} />}
    </div>
  )
}
