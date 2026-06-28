import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { toast } from '@/components/shared/Toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useClients } from '@/hooks/useClients'
import { useProjects } from '@/hooks/useProjects'
import {
  useTasks, useUpdateTask, pokeAlerts,
  type TaskWithRelations, type TaskStatus, type TaskPriority,
} from '@/hooks/useTasks'
import { formatDate, cn } from '@/lib/utils'
import { TaskModal } from './TaskModal'

type Tab = 'mine' | 'byme' | 'all'

const STATUS_META: Record<TaskStatus, { label: string; cls: string }> = {
  open:        { label: 'Open',        cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  in_progress: { label: 'In Progress', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  done:        { label: 'Done',        cls: 'bg-green-50 text-green-700 border-green-200' },
  cancelled:   { label: 'Cancelled',   cls: 'bg-gray-100 text-gray-500 border-gray-200' },
}
const PRIORITY_DOT: Record<TaskPriority, string> = {
  high: 'bg-red-500', normal: 'bg-blue-400', low: 'bg-gray-300',
}

export default function TasksPage() {
  const { profile } = useAuth()
  const me = profile?.id ?? ''
  const isAdmin = ['super_admin', 'director'].includes(profile?.role ?? '')
  const isManager = isAdmin || profile?.role === 'manager'

  const { data: tasks = [], isLoading } = useTasks()
  const updateTask = useUpdateTask()

  const { data: clients = [] } = useClients()
  const { data: projects = [] } = useProjects()
  const { data: staff = [] } = useQuery({
    queryKey: ['profiles', 'staff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles').select('id, name, role').eq('is_active', true).order('name')
      if (error) throw error
      return data as { id: string; name: string; role: string }[]
    },
  })

  const [tab, setTab] = useState<Tab>('mine')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('open')
  const [editing, setEditing] = useState<TaskWithRelations | null>(null)
  const [creating, setCreating] = useState(false)

  const visible = useMemo(() => {
    let list = tasks
    if (tab === 'mine') list = list.filter(t => t.assigned_to === me)
    else if (tab === 'byme') list = list.filter(t => t.assigned_by === me)
    if (statusFilter !== 'all') list = list.filter(t => t.status === statusFilter)
    return list
  }, [tasks, tab, me, statusFilter])

  const counts = useMemo(() => ({
    mine: tasks.filter(t => t.assigned_to === me && t.status !== 'done' && t.status !== 'cancelled').length,
    byme: tasks.filter(t => t.assigned_by === me).length,
  }), [tasks, me])

  // Inline status change from the row. Done asks confirmation + notifies; done
  // tasks are locked for anyone who isn't the assigner/admin.
  const changeStatus = async (t: TaskWithRelations, status: TaskStatus) => {
    if (status === 'done' && t.status !== 'done' &&
        !confirm('Mark this task as Done? This locks the task and notifies the assigner. It cannot be edited after.')) return
    try {
      await updateTask.mutateAsync({ id: t.id, status })
      if (status === 'done' && t.status !== 'done') pokeAlerts()
    } catch (e: any) { toast.error('Update failed', e.message) }
  }

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'mine', label: 'My Tasks',      badge: counts.mine },
    { key: 'byme', label: 'Assigned by me', badge: counts.byme },
    ...(isManager ? [{ key: 'all' as Tab, label: 'All Tasks' }] : []),
  ]

  return (
    <div>
      <TopBar title="Tasks" subtitle="Assign work, track follow-ups" />
      <div className="p-6 animate-fade-up space-y-5">

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 glass-panel rounded-xl p-1">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all',
                  tab === t.key ? 'bg-white text-brand-700 font-medium' : 'text-white/70 hover:text-white')}>
                {t.label}
                {t.badge ? <span className="text-[10px] bg-brand-600 text-white rounded-full px-1.5 py-0.5">{t.badge}</span> : null}
              </button>
            ))}
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-white">
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <div className="flex-1" />
          <button onClick={() => { setEditing(null); setCreating(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">
            <Sym name="add" size={16} /> New Task
          </button>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-2 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-16 glass-panel rounded-xl" />)}</div>
        ) : visible.length === 0 ? (
          <div className="glass-panel rounded-xl border-dashed !border-white/20 p-12 text-center">
            <Sym name="task_alt" size={32} className="mx-auto text-white/40 mb-3" />
            <p className="text-sm text-white/60">No tasks here. Create one with “New Task”.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map(t => {
              const overdue = t.due_date && t.status !== 'done' && t.status !== 'cancelled' && t.due_date < todayISO()
              const lockedRow = t.status === 'done' && !(isAdmin || t.assigned_by === me)
              return (
                <div key={t.id} onClick={() => { setCreating(false); setEditing(t) }}
                  className="bg-white rounded-xl border border-border px-5 py-4 flex items-center gap-4 cursor-pointer hover:border-brand-600/30 hover:shadow-sm transition-all">
                  <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', PRIORITY_DOT[t.priority])} title={`${t.priority} priority`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={cn('font-semibold text-sm', t.status === 'done' ? 'text-muted-foreground line-through' : 'text-brand-950')}>{t.title}</p>
                      {t.project && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-brand-50 border border-brand-200 text-brand-700 px-1.5 py-0.5 rounded">
                          <Sym name="assignment" size={10} />{t.project.project_code}
                        </span>
                      )}
                      {t.client && !t.project && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-[#F8FAFC] border border-border text-muted-foreground px-1.5 py-0.5 rounded">
                          <Sym name="apartment" size={10} />{t.client.company_name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      For <span className="font-medium text-brand-950">{t.assignee?.name ?? '—'}</span>
                      {' · by '}{t.assigner?.name ?? '—'}
                      {t.due_date && <> · <span className={cn(overdue && 'text-red-600 font-medium')}>{overdue ? 'Overdue ' : 'Due '}{formatDate(t.due_date)}</span></>}
                    </p>
                  </div>
                  <select value={t.status} disabled={lockedRow}
                    onClick={e => e.stopPropagation()}
                    onChange={e => { e.stopPropagation(); changeStatus(t, e.target.value as TaskStatus) }}
                    className={cn('text-xs px-2 py-1 rounded border font-medium shrink-0', STATUS_META[t.status].cls, lockedRow ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer')}>
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {(creating || editing) && (
        <TaskModal
          task={editing}
          me={me}
          isAdmin={isAdmin}
          staff={staff}
          projects={projects as any}
          clients={clients}
          onClose={() => { setEditing(null); setCreating(false) }}
        />
      )}
    </div>
  )
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
