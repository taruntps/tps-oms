import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sym } from '@/components/shared/Sym'
import { TopBar } from '@/components/layout/TopBar'
import { ClockBadge } from '@/components/shared/ClockBadge'
import { ProjectForm } from './ProjectForm'
import { useProjects } from '@/hooks/useProjects'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate, formatRupees, cn } from '@/lib/utils'
import type { Database } from '@/types/database'

type ProjectStatus = Database['public']['Enums']['project_status']

const STATUS_FILTERS: { label: string; value: ProjectStatus | 'all' }[] = [
  { label: 'All',        value: 'all' },
  { label: 'Active',     value: 'active' },
  { label: 'On Hold',    value: 'on_hold' },
  { label: 'Completed',  value: 'completed' },
  { label: 'Cancelled',  value: 'cancelled' },
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
  const { profile } = useAuth()
  const { data: projects = [], isLoading } = useProjects()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all')
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [showForm, setShowForm] = useState(false)

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

  const filtered = scoped.filter(p => {
    const matchStatus = statusFilter === 'all' || p.status === statusFilter
    const q = search.toLowerCase()
    const matchSearch = !q ||
      p.project_code?.toLowerCase().includes(q) ||
      p.project_name?.toLowerCase().includes(q) ||
      p.clients?.company_name?.toLowerCase().includes(q) ||
      p.service_type?.toLowerCase().includes(q)
    return matchStatus && matchSearch
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

        {/* Search + filter + new */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Sym name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by code, name, client…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
            />
          </div>

          <div className="flex gap-1 bg-white/10 p-1 rounded-lg border border-white/15">
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

          {canAssign && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"
            >
              <Sym name="add" size={16} />
              New Project
            </button>
          )}
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
          <div className="space-y-3">
            {filtered.map(p => (
              <div
                key={p.id}
                onClick={() => navigate(`/projects/${p.id}`)}
                className="bg-white rounded-xl border border-border p-5 cursor-pointer hover:border-brand-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground bg-[#F8FAFC] border border-border px-2 py-0.5 rounded">
                        {p.project_code}
                      </span>
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium capitalize', STATUS_BADGE[p.status as ProjectStatus])}>
                        {p.status?.replace('_', ' ')}
                      </span>
                      {p.is_blocked && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">BLOCKED</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-brand-950 mt-1">{p.project_name?.trim() || p.service_type}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span>{p.clients?.company_name}</span>
                      {p.service_type && <span className={cn('text-[10px] border px-1.5 py-0.5 rounded font-medium', projectTypeBadge(p.service_type))}>{p.service_type}</span>}
                      {p.profiles_assigned && <span>Executive: {p.profiles_assigned.name}</span>}
                      {p.target_date && <span>Due {formatDate(p.target_date)}</span>}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {p.active_clock && p.clock_switched_at && (
                      <ClockBadge
                        clock={p.active_clock}
                        since={p.clock_switched_at}
                        isBlocked={p.is_blocked ?? false}
                        personName={(p as any).profiles_assigned?.name}
                      />
                    )}
                    {p.quoted_amount && (
                      <span className="text-xs font-mono text-muted-foreground">{formatRupees(p.quoted_amount)}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && <ProjectForm onClose={() => setShowForm(false)} />}
    </div>
  )
}
