// HRMS — Onboarding (/hrms/lifecycle/onboarding), gated hrms.onboarding.manage.
// Onboarding runs with their checklist tasks (materialised from a template). Start a
// run for an employee, tick/waive tasks, and mark the run complete.
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { formatDate } from '@/lib/utils'
import { useCan } from '@/core/access/useCan'
import { useEmployees } from '../hooks/useEmployees'
import {
  useOnboardings,
  useOnboardingTemplates,
  useStartOnboarding,
  useCompleteOnboarding,
  useOnboardingTasks,
  useAddOnboardingTask,
  useSetOnboardingTaskStatus,
} from '../hooks/useLifecycle'
import { StatusPill, inputCls } from './recruitShared'
import type { Onboarding } from '../api/onboarding'

export default function OnboardingPage() {
  const canManage = useCan('hrms.onboarding.manage')
  const { data: onboardings = [], isLoading } = useOnboardings()
  const { data: employees = [] } = useEmployees()
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const empName = useMemo(() => new Map(employees.map(e => [e.id, e.name ?? e.employee_code ?? e.id.slice(0, 8)])), [employees])
  const inProgress = onboardings.filter(o => o.status === 'in_progress').length

  return (
    <div>
      <TopBar title="Onboarding" subtitle={`${inProgress} in progress · ${onboardings.length} total`} />

      <div className="p-6 animate-fade-up space-y-5">
        {canManage && (
          <div className="flex justify-end">
            <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors">
              <Sym name="add" size={16} /> Start Onboarding
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-white rounded-lg border border-border animate-pulse" />)}</div>
        ) : onboardings.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="checklist" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No onboarding runs yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {onboardings.map(o => (
              <OnboardingRow
                key={o.id}
                onboarding={o}
                employeeName={empName.get(o.employee_id) ?? o.employee_id.slice(0, 8)}
                canManage={canManage}
                expanded={expanded === o.id}
                onToggle={() => setExpanded(expanded === o.id ? null : o.id)}
              />
            ))}
          </div>
        )}
      </div>

      {showForm && canManage && <StartOnboardingModal onClose={() => setShowForm(false)} />}
    </div>
  )
}

function OnboardingRow({ onboarding, employeeName, canManage, expanded, onToggle }: {
  onboarding: Onboarding
  employeeName: string
  canManage: boolean
  expanded: boolean
  onToggle: () => void
}) {
  const { data: tasks = [] } = useOnboardingTasks(expanded ? onboarding.id : '')
  const setTaskStatus = useSetOnboardingTaskStatus(onboarding.id)
  const complete = useCompleteOnboarding()
  const addTask = useAddOnboardingTask()
  const [newTask, setNewTask] = useState('')

  const done = tasks.filter(t => t.status !== 'pending').length

  return (
    <div className="bg-white rounded-xl border border-border">
      <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={onToggle}>
        <div className="w-9 h-9 rounded-lg bg-brand-600/10 flex items-center justify-center shrink-0">
          <Sym name="checklist" size={18} className="text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-brand-950">{employeeName}</span>
            <StatusPill status={onboarding.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">Started {formatDate(onboarding.started_at)}</p>
        </div>
        <Sym name={expanded ? 'expand_less' : 'expand_more'} size={18} className="text-muted-foreground" />
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border pt-3 space-y-2">
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No checklist tasks.</p>
          ) : (
            tasks.map(t => (
              <div key={t.id} className="flex items-center gap-3">
                <button
                  onClick={() => canManage && setTaskStatus.mutate({ id: t.id, status: t.status === 'done' ? 'pending' : 'done' })}
                  disabled={!canManage || setTaskStatus.isPending}
                  className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${t.status === 'done' ? 'bg-green-600 border-green-600 text-white' : 'border-border text-transparent hover:border-brand-600'} disabled:opacity-60`}
                >
                  <Sym name="check" size={13} />
                </button>
                <span className={`text-sm flex-1 ${t.status === 'done' ? 'line-through text-muted-foreground' : t.status === 'waived' ? 'text-muted-foreground italic' : 'text-brand-950'}`}>{t.title}</span>
                {t.status !== 'done' && canManage && (
                  <button
                    onClick={() => setTaskStatus.mutate({ id: t.id, status: t.status === 'waived' ? 'pending' : 'waived' })}
                    disabled={setTaskStatus.isPending}
                    className="text-[11px] text-muted-foreground hover:text-brand-950 border border-border rounded px-1.5 py-0.5"
                  >
                    {t.status === 'waived' ? 'Un-waive' : 'Waive'}
                  </button>
                )}
              </div>
            ))
          )}

          {canManage && (
            <div className="flex items-center gap-2 pt-2">
              <input value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="Add a task…" className={`${inputCls} flex-1`} />
              <button
                onClick={() => { if (newTask.trim()) { addTask.mutate({ onboarding_id: onboarding.id, title: newTask.trim() }); setNewTask('') } }}
                disabled={addTask.isPending || !newTask.trim()}
                className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50"
              >
                Add
              </button>
            </div>
          )}

          {canManage && onboarding.status === 'in_progress' && (
            <div className="flex justify-end pt-2">
              <button
                onClick={() => complete.mutate(onboarding.id)}
                disabled={complete.isPending}
                title={done < tasks.length ? 'Some tasks are still pending' : undefined}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                <Sym name="task_alt" size={14} /> Mark complete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StartOnboardingModal({ onClose }: { onClose: () => void }) {
  const { data: employees = [] } = useEmployees()
  const { data: templates = [] } = useOnboardingTemplates()
  const start = useStartOnboarding()
  const [employeeId, setEmployeeId] = useState('')
  const [templateId, setTemplateId] = useState('')

  const submit = () => {
    if (!employeeId) return
    start.mutate({ employeeId, templateId: templateId || null }, { onSuccess: onClose })
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">Start Onboarding</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Employee<span className="text-red-500">*</span></label>
            <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className={inputCls}>
              <option value="">Select…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name ?? e.employee_code ?? e.id.slice(0, 8)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Template</label>
            <select value={templateId} onChange={e => setTemplateId(e.target.value)} className={inputCls}>
              <option value="">No template (empty checklist)</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.tasks.length} tasks)</option>)}
            </select>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={submit} disabled={start.isPending || !employeeId} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">Start</button>
        </div>
      </div>
    </div>
  )
}
