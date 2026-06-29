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
type FilterValue = 'all' | 'pending' | 'with_client' | 'authority' | 'on_hold' | 'completed' | 'cancelled'

const STATUS_FILTERS: { label: string; value: FilterValue }[] = [
  { label: 'All',       value: 'all' },
  // "Pending" = active & actionable (NOT solely waiting on FSSAI). Default view.
  { label: 'Pending',   value: 'pending' },
  { label: 'Client',    value: 'with_client' }, // active & clock with client
  { label: 'FSSAI',     value: 'authority' },   // active & waiting on authority
  { label: 'On Hold',   value: 'on_hold' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
]

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
  const [searchParams] = useSearchParams()
  const { profile } = useAuth()
  const { data: projects = [], isLoading } = useProjects()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<FilterValue>('pending')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [showForm, setShowForm] = useState(false)

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
  const filtered = scoped.filter(p => {
    const matchStatus =
      statusFilter === 'all'         ? true :
      statusFilter === 'pending'     ? (p.status === 'active' && !isAuthorityOnly(p as any)) :
      statusFilter === 'with_client' ? (p.status === 'active' && clockBucket(p as any) === 'client') :
      statusFilter === 'authority'   ? (p.status === 'active' && clockBucket(p as any) === 'authority') :
      p.status === statusFilter
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
                statusFilter === f.value ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'
              )}
            >
              {f.label}
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
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  className="bg-white rounded-xl border border-border px-4 py-3 cursor-pointer hover:border-brand-300 hover:shadow-sm transition-all"
                >
                  {/* Line 1: code + status (left) · clock + executive (right) */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[11px] text-muted-foreground bg-[#F8FAFC] border border-border px-1.5 py-0.5 rounded shrink-0">
                        {p.project_code}
                      </span>
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium capitalize shrink-0', STATUS_BADGE[p.status as ProjectStatus])}>
                        {p.status?.replace('_', ' ')}
                      </span>
                      {p.is_blocked && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700 shrink-0">BLOCKED</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {chips.map((chip, i) => (
                        <ClockBadge key={chip.clock + i} clock={chip.clock} since={chip.since}
                          isBlocked={(p.is_blocked ?? false) && i === 0} personName={(p as any).profiles_assigned?.name} />
                      ))}
                      {withSomeoneElse && execFirst && (
                        <span className="text-[11px] text-muted-foreground hidden sm:inline">· {execFirst}</span>
                      )}
                    </div>
                  </div>

                  {/* Line 2: type + company (left) · location · due (right) */}
                  <div className="flex items-center justify-between gap-3 mt-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {p.service_type && (
                        <span className={cn('text-[10px] border px-1.5 py-0.5 rounded font-medium shrink-0', projectTypeBadge(p.service_type))}>
                          {p.service_type}
                        </span>
                      )}
                      <span className="text-sm font-medium text-brand-950 truncate">{p.clients?.company_name}</span>
                      {(p as any).clients?.client_code && (
                        <span
                          onClick={e => { e.stopPropagation(); navigate(`/clients/${p.client_id}`) }}
                          className="text-[10px] font-mono text-brand-600 bg-brand-50 border border-brand-200 px-1.5 py-0.5 rounded shrink-0 cursor-pointer hover:bg-brand-100"
                          title="Open client"
                        >
                          #{(p as any).clients.client_code}
                        </span>
                      )}
                      {(p as any).app_ref_no && (
                        <span
                          onClick={e => {
                            e.stopPropagation()
                            navigator.clipboard.writeText((p as any).app_ref_no)
                            toast.success('Copied!', (p as any).app_ref_no)
                          }}
                          className="text-[10px] font-mono text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded shrink-0 cursor-pointer hover:bg-blue-100"
                          title="Click to copy App Ref No."
                        >
                          #{(p as any).app_ref_no}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground shrink-0">
                      {loc && <span className="hidden sm:inline">📍 {loc}</span>}
                      {p.target_date && <span>Due {formatDate(p.target_date)}</span>}
                    </div>
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
