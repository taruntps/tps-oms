import { useState } from 'react'
import { Sym } from '@/components/shared/Sym'
import { toast } from '@/components/shared/Toast'
import { formatDate, cn } from '@/lib/utils'
import {
  useCreateTask, useUpdateTask, useDeleteTask,
  useTaskThread, useAddComment, useRequestExtension, useDecideExtension, pokeAlerts,
  type TaskWithRelations, type TaskStatus, type TaskPriority,
} from '@/hooks/useTasks'

interface Staff { id: string; name: string; role: string }
interface Props {
  task: TaskWithRelations | null            // null → create mode
  me: string
  isAdmin: boolean
  staff: Staff[]
  projects: { id: string; project_name: string; project_code?: string }[]
  clients: { id: string; company_name: string }[]
  onClose: () => void
}

const ic = 'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 disabled:bg-[#F8FAFC] disabled:text-muted-foreground'

export function TaskModal({ task, me, isAdmin, staff, projects, clients, onClose }: Props) {
  const creating = !task
  const isAssigner = !!task && task.assigned_by === me
  const isAssignee = !!task && task.assigned_to === me
  const canEditCore = creating || isAdmin || isAssigner

  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const addComment = useAddComment()
  const reqExt = useRequestExtension()
  const decideExt = useDecideExtension()
  const { data: thread } = useTaskThread(task?.id ?? null)

  // editable form state (core)
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [assignedTo, setAssignedTo] = useState(task?.assigned_to ?? me)
  const [projectId, setProjectId] = useState(task?.project_id ?? '')
  const [clientId, setClientId] = useState(task?.client_id ?? '')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'normal')
  const [dueDate, setDueDate] = useState(task?.due_date ?? '')
  const [status, setStatus] = useState<TaskStatus>((task?.status as TaskStatus) ?? 'pending')

  const [comment, setComment] = useState('')
  const [extDays, setExtDays] = useState('')
  const [extReason, setExtReason] = useState('')

  const isDone = status === 'done'
  const lockedForViewer = isDone && !canEditCore            // assignee after done
  const pending = thread?.extensions.find(e => e.status === 'pending') ?? null

  // ── core save (assigner/admin/create) ──
  const saveCore = async () => {
    if (!title.trim()) { toast.error('Task title is required'); return }
    if (!assignedTo)   { toast.error('Pick who the task is for'); return }
    const payload = {
      title: title.trim(), description: description.trim() || null,
      assigned_to: assignedTo, project_id: projectId || null, client_id: clientId || null,
      priority, due_date: dueDate || null,
    }
    try {
      if (creating) {
        await createTask.mutateAsync({ ...payload, assigned_by: me })
        toast.success('Task created')
      } else {
        if (status === 'done' && task!.status !== 'done' &&
            !confirm('Mark this task as Done? It will lock the task and notify the assigner. It cannot be edited after.')) return
        await updateTask.mutateAsync({ id: task!.id, ...payload, status })
        if (status === 'done' && task!.status !== 'done') pokeAlerts()
        toast.success('Task updated')
      }
      onClose()
    } catch (e: any) { toast.error('Could not save', e.message) }
  }

  // ── assignee-only status change (applies immediately) ──
  const applyStatus = async (next: TaskStatus) => {
    if (next === 'done' && !confirm('Mark this task as Done? This locks the task and notifies the assigner. You won’t be able to edit it after.')) return
    try {
      await updateTask.mutateAsync({ id: task!.id, status: next })
      setStatus(next)
      if (next === 'done') pokeAlerts()
      toast.success(next === 'done' ? 'Marked done — assigner notified' : 'Status updated')
    } catch (e: any) { toast.error('Update failed', e.message) }
  }

  const submitComment = async () => {
    if (!comment.trim() || !task) return
    try { await addComment.mutateAsync({ taskId: task.id, body: comment.trim(), me }); setComment('') }
    catch (e: any) { toast.error('Could not add comment', e.message) }
  }

  const submitExtension = async () => {
    const d = parseInt(extDays, 10)
    if (!d || d < 1) { toast.error('Enter the number of extra days'); return }
    try {
      await reqExt.mutateAsync({ taskId: task!.id, days: d, reason: extReason.trim() })
      setExtDays(''); setExtReason('')
      toast.success('Extension requested — assigner notified')
    } catch (e: any) { toast.error('Could not request', e.message) }
  }

  const decide = async (requestId: string, approve: boolean) => {
    try {
      await decideExt.mutateAsync({ requestId, approve, taskId: task!.id })
      toast.success(approve ? 'Approved — due date extended' : 'Request rejected')
    } catch (e: any) { toast.error('Failed', e.message) }
  }

  const remove = async () => {
    if (!task) return
    if (!confirm(`Delete task "${task.title}"?`)) return
    try { await deleteTask.mutateAsync(task.id); toast.success('Task deleted'); onClose() }
    catch (e: any) { toast.error('Delete failed', e.message) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-brand-950">
            {creating ? 'New Task' : 'Task Details'}
          </h2>
          {lockedForViewer && (
            <span className="inline-flex items-center gap-1 text-[11px] text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">
              <Sym name="lock" size={11} /> Completed & locked
            </span>
          )}
        </div>

        {/* Core fields */}
        <Field label="Title *">
          <input className={ic} value={title} autoFocus={creating} disabled={!canEditCore || lockedForViewer}
            onChange={e => setTitle(e.target.value)} placeholder="e.g. Follow up on pending payment" />
        </Field>
        <Field label="Details">
          <textarea rows={2} className={ic} value={description} disabled={!canEditCore || lockedForViewer}
            onChange={e => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Assign to *">
            <select className={ic} value={assignedTo} disabled={!canEditCore || lockedForViewer}
              onChange={e => setAssignedTo(e.target.value)}>
              <option value="">Select…</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}{s.id === me ? ' (me)' : ''}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className={ic} value={priority} disabled={!canEditCore || lockedForViewer}
              onChange={e => setPriority(e.target.value as TaskPriority)}>
              <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Link Project">
            <select className={ic} value={projectId} disabled={!canEditCore || lockedForViewer}
              onChange={e => setProjectId(e.target.value)}>
              <option value="">None</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} · {p.project_name}</option>)}
            </select>
          </Field>
          <Field label="Link Client">
            <select className={ic} value={clientId} disabled={!canEditCore || lockedForViewer}
              onChange={e => setClientId(e.target.value)}>
              <option value="">None</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Due Date">
            <input type="date" className={ic} value={dueDate} disabled={!canEditCore || lockedForViewer}
              onChange={e => setDueDate(e.target.value)} />
          </Field>
          {!creating && (
            <Field label="Status">
              <select className={ic} value={status} disabled={lockedForViewer}
                onChange={e => canEditCore ? setStatus(e.target.value as TaskStatus) : applyStatus(e.target.value as TaskStatus)}>
                <option value="pending">Pending</option>
                <option value="done">Done</option>
                {canEditCore && <option value="cancelled">Cancelled</option>}
              </select>
            </Field>
          )}
        </div>

        {/* Extension requests */}
        {!creating && (
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold text-brand-950 mb-2 flex items-center gap-1.5">
              <Sym name="more_time" size={13} /> Deadline extensions
            </p>

            {/* assignee can request when not done and nothing pending */}
            {isAssignee && !canEditCore && !lockedForViewer && !pending && (
              <div className="flex flex-wrap items-end gap-2 mb-2">
                <div className="w-20">
                  <label className="block text-[10px] text-muted-foreground mb-0.5">Extra days</label>
                  <input className={ic} type="number" min={1} value={extDays} onChange={e => setExtDays(e.target.value)} />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-[10px] text-muted-foreground mb-0.5">Reason</label>
                  <input className={ic} value={extReason} onChange={e => setExtReason(e.target.value)} placeholder="Why more time is needed" />
                </div>
                <button onClick={submitExtension} disabled={reqExt.isPending}
                  className="px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">Request</button>
              </div>
            )}

            {(thread?.extensions.length ?? 0) === 0 ? (
              <p className="text-[11px] text-muted-foreground">No extension requests.</p>
            ) : (
              <div className="space-y-1.5">
                {thread!.extensions.map(e => (
                  <div key={e.id} className="flex items-center gap-2 text-xs bg-[#F8FAFC] border border-border rounded-lg px-3 py-2">
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium',
                      e.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                      e.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>{e.status}</span>
                    <span className="text-brand-950 font-medium">+{e.extra_days}d</span>
                    <span className="text-muted-foreground truncate flex-1">{e.reason ?? ''} · {e.requester?.name ?? ''}</span>
                    {e.status === 'pending' && canEditCore && (
                      <span className="flex gap-1 shrink-0">
                        <button onClick={() => decide(e.id, true)} disabled={decideExt.isPending}
                          className="px-2 py-0.5 bg-green-600 text-white rounded text-[10px] hover:bg-green-700 disabled:opacity-50">Approve</button>
                        <button onClick={() => decide(e.id, false)} disabled={decideExt.isPending}
                          className="px-2 py-0.5 border border-red-300 text-red-600 rounded text-[10px] hover:bg-red-50 disabled:opacity-50">Reject</button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Comments */}
        {!creating && (
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold text-brand-950 mb-2 flex items-center gap-1.5">
              <Sym name="forum" size={13} /> Comments
            </p>
            <div className="space-y-2 max-h-40 overflow-y-auto mb-2">
              {(thread?.comments.length ?? 0) === 0 ? (
                <p className="text-[11px] text-muted-foreground">No comments yet.</p>
              ) : thread!.comments.map(c => (
                <div key={c.id} className="text-xs">
                  <span className="font-medium text-brand-950">{c.author?.name ?? '—'}</span>
                  <span className="text-muted-foreground"> · {formatDate(c.created_at)}</span>
                  <p className="text-brand-950/90 whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input className={ic} value={comment} onChange={e => setComment(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitComment() }} placeholder="Add a comment…" />
              <button onClick={submitComment} disabled={addComment.isPending || !comment.trim()}
                className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50">Post</button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <div>
            {!creating && canEditCore && (
              <button onClick={remove} disabled={deleteTask.isPending}
                className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1 disabled:opacity-50">
                <Sym name="delete" size={13} /> Delete
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Close</button>
            {(canEditCore && !lockedForViewer) && (
              <button onClick={saveCore} disabled={createTask.isPending || updateTask.isPending}
                className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
                {(createTask.isPending || updateTask.isPending) ? 'Saving…' : creating ? 'Create Task' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-brand-950 mb-1">{label}</label>{children}</div>
}
