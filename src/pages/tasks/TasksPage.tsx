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
  useTasks, useCreateTask, useUpdateTask, useDeleteTask,
  type TaskWithRelations, type TaskStatus, type TaskPriority,
} from '@/hooks/useTasks'
import { formatDate, cn } from '@/lib/utils'

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

interface Draft {
  title: string; description: string; assigned_to: string
  project_id: string; client_id: string; priority: TaskPriority; due_date: string
}
const emptyDraft = (me: string): Draft => ({
  title: '', description: '', assigned_to: me,
  project_id: '', client_id: '', priority: 'normal', due_date: '',
})

export default function TasksPage() {
  const { profile } = useAuth()
  const me = profile?.id ?? ''
  const isManager = ['super_admin', 'director', 'manager'].includes(profile?.role ?? '')

  const { data: tasks = [], isLoading } = useTasks()
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

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
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [draft, setDraft] = useState<Draft | null>(null)

  const visible = useMemo(() => {
    let list = tasks
    if (tab === 'mine') list = list.filter(t => t.assigned_to === me)
    else if (tab === 'byme') list = list.filter(t => t.assigned_by === me)
    // 'all' = whatever RLS returned (managers see everything)
    if (statusFilter !== 'all') list = list.filter(t => t.status === statusFilter)
    return list
  }, [tasks, tab, me, statusFilter])

  const counts = useMemo(() => ({
    mine: tasks.filter(t => t.assigned_to === me && t.status !== 'done' && t.status !== 'cancelled').length,
    byme: tasks.filter(t => t.assigned_by === me).length,
  }), [tasks, me])

  const save = async () => {
    if (!draft) return
    if (!draft.title.trim()) { toast.error('Task title is required'); return }
    if (!draft.assigned_to)  { toast.error('Pick who the task is for'); return }
    try {
      await createTask.mutateAsync({
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        assigned_to: draft.assigned_to,
        assigned_by: me,
        project_id: draft.project_id || null,
        client_id: draft.client_id || null,
        priority: draft.priority,
        due_date: draft.due_date || null,
      })
      toast.success('Task created')
      setDraft(null)
    } catch (e: any) { toast.error('Could not create task', e.message) }
  }

  const changeStatus = async (t: TaskWithRelations, status: TaskStatus) => {
    try { await updateTask.mutateAsync({ id: t.id, status }) }
    catch (e: any) { toast.error('Update failed', e.message) }
  }

  const remove = async (t: TaskWithRelations) => {
    if (!confirm(`Delete task "${t.title}"?`)) return
    try { await deleteTask.mutateAsync(t.id); toast.success('Task deleted') }
    catch (e: any) { toast.error('Delete failed', e.message) }
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
          <button onClick={() => setDraft(emptyDraft(me))}
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
              const canDelete = t.assigned_by === me || ['super_admin','director'].includes(profile?.role ?? '')
              return (
                <div key={t.id} className="bg-white rounded-xl border border-border px-5 py-4 flex items-center gap-4">
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
                  <select value={t.status} onChange={e => changeStatus(t, e.target.value as TaskStatus)}
                    className={cn('text-xs px-2 py-1 rounded border font-medium shrink-0', STATUS_META[t.status].cls)}>
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  {canDelete && (
                    <button onClick={() => remove(t)} className="p-1.5 text-muted-foreground hover:text-red-600 shrink-0" title="Delete">
                      <Sym name="delete" size={14} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create task modal */}
      {draft && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-3 max-h-[90vh] overflow-y-auto">
            <h2 className="font-display font-semibold text-brand-950">New Task</h2>
            <Field label="Title *"><input className={ic} value={draft.title} autoFocus
              onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Follow up on pending payment" /></Field>
            <Field label="Details"><textarea rows={2} className={ic} value={draft.description}
              onChange={e => setDraft({ ...draft, description: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Assign to *">
                <select className={ic} value={draft.assigned_to} onChange={e => setDraft({ ...draft, assigned_to: e.target.value })}>
                  <option value="">Select…</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}{s.id === me ? ' (me)' : ''}</option>)}
                </select>
              </Field>
              <Field label="Priority">
                <select className={ic} value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value as TaskPriority })}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Link Project (optional)">
                <select className={ic} value={draft.project_id} onChange={e => setDraft({ ...draft, project_id: e.target.value })}>
                  <option value="">None</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{(p as any).project_code} · {p.project_name}</option>)}
                </select>
              </Field>
              <Field label="Link Client (optional)">
                <select className={ic} value={draft.client_id} onChange={e => setDraft({ ...draft, client_id: e.target.value })}>
                  <option value="">None</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Due Date"><input type="date" className={ic} value={draft.due_date}
              onChange={e => setDraft({ ...draft, due_date: e.target.value })} /></Field>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDraft(null)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={save} disabled={createTask.isPending}
                className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
                {createTask.isPending ? 'Creating…' : 'Create Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-brand-950 mb-1">{label}</label>{children}</div>
}
const ic = 'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20'
