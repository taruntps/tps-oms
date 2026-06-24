import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, FolderOpen } from 'lucide-react'
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
      p.project_name.toLowerCase().includes(q) ||
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
        <div className="inline-flex rounded-lg border border-border bg-[#F8FAFC] p-1 text-sm">
          <button
            onClick={() => setScope('mine')}
            className={cn(
              'px-4 py-1.5 rounded-md font-medium transition-all',
              effectiveScope === 'mine' ? 'bg-white text-brand-950 shadow-sm' : 'text-muted-foreground hover:text-brand-950'
            )}
          >
            My Projects <span className="text-xs text-muted-foreground">({mineCount})</span>
          </button>
          {canViewAll && (
            <button
              onClick={() => setScope('all')}
              className={cn(
                'px-4 py-1.5 rounded-md font-medium transition-all',
                effectiveScope === 'all' ? 'bg-white text-brand-950 shadow-sm' : 'text-muted-foreground hover:text-brand-950'
              )}
            >
              Overall <span className="text-xs text-muted-foreground">({projects.length})</span>
            </button>
          )}
        </div>

        {effectiveScope === 'all' && (
          <p className="text-[11px] text-muted-foreground -mt-2">
            Viewing all projects (read-only) — you can only edit projects assigned to you.
          </p>
        )}

        {/* Search + filter + new */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by code, name, client…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
            />
          </div>

          <div className="flex gap-1 bg-[#F8FAFC] p-1 rounded-lg border border-border">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-all',
                  statusFilter === f.value ? 'bg-white text-brand-950 shadow-sm' : 'text-muted-foreground hover:text-brand-950'
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
              <Plus size={14} />
              New Project
            </button>
          )}
        </div>

        {/* Project list */}
        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-xl border border-border" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <FolderOpen size={32} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No projects found</p>
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
                    <h3 className="font-semibold text-brand-950 mt-1">{p.project_name}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span>{p.clients?.company_name}</span>
                      {p.service_type && <span className="text-[10px] bg-[#F8FAFC] border border-border px-1.5 py-0.5 rounded">{p.service_type}</span>}
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
