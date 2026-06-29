import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Sym } from '@/components/shared/Sym'
import { useUpdateProject, useUpdateStage } from '@/hooks/useProjects'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/shared/Toast'
import { cn } from '@/lib/utils'
import { SERVICE_TYPES } from '@/data/india'

type StageStatus = 'pending' | 'in_progress' | 'blocked' | 'completed' | 'skipped' | 'not_required'

const STATUS_LABELS: Record<StageStatus, string> = {
  pending:      'Pending',
  in_progress:  'In Progress',
  blocked:      'Blocked',
  completed:    'Completed',
  skipped:      'Skipped',
  not_required: 'Not Required',
}
const STATUS_COLORS: Record<StageStatus, string> = {
  pending:      'bg-gray-100 text-gray-600',
  in_progress:  'bg-blue-100 text-blue-700',
  blocked:      'bg-red-100 text-red-700',
  completed:    'bg-green-100 text-green-700',
  skipped:      'bg-amber-100 text-amber-700',
  not_required: 'bg-purple-100 text-purple-700',
}

const PAYMENT_STATUSES = ['pending', 'partial', 'paid', 'overdue', 'waived'] as const

interface Props {
  project: any
  stages: any[]
  onClose: () => void
}

type Tab = 'details' | 'stages'

export function EditProjectModal({ project, stages, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('details')
  const updateProject = useUpdateProject()
  const updateStage   = useUpdateStage()

  // ── Project detail state ───────────────────────────────────────────────
  const [assignedTo,     setAssignedTo]     = useState<string>(project.assigned_to ?? '')
  const [managerId,      setManagerId]      = useState<string>(project.manager_id ?? '')
  const [serviceType,    setServiceType]    = useState<string>(project.service_type ?? '')
  const [targetDate,     setTargetDate]     = useState<string>(project.target_date?.slice(0, 10) ?? '')
  const [quotedAmount,   setQuotedAmount]   = useState<string>(String((project.quoted_amount ?? 0) / 100))
  const [paymentStatus,  setPaymentStatus]  = useState<string>(project.payment_status ?? 'pending')
  const [projectStatus,  setProjectStatus]  = useState<string>(project.status ?? 'active')
  const [notes,          setNotes]          = useState<string>(project.notes ?? '')
  const [savingDetails,  setSavingDetails]  = useState(false)

  // ── Stage override state ───────────────────────────────────────────────
  const sortedStages = [...stages].sort((a, b) => a.stage_order - b.stage_order)
  const [stageStatuses, setStageStatuses] = useState<Record<string, StageStatus>>(
    Object.fromEntries(sortedStages.map(s => [s.id, s.status as StageStatus]))
  )
  const [savingStages, setSavingStages] = useState(false)

  // ── Staff list ─────────────────────────────────────────────────────────
  const { data: staff = [] } = useQuery({
    queryKey: ['profiles', 'staff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles').select('id, name, role').eq('is_active', true).order('name')
      if (error) throw error
      return data
    },
  })
  const executives = staff.filter(s => ['executive', 'manager', 'director', 'super_admin'].includes(s.role))
  const managers   = staff.filter(s => ['manager', 'director', 'super_admin'].includes(s.role))

  // ── Save project details ───────────────────────────────────────────────
  const saveDetails = async () => {
    setSavingDetails(true)
    try {
      await updateProject.mutateAsync({
        id:             project.id,
        assigned_to:    assignedTo    || null,
        manager_id:     managerId     || null,
        service_type:   serviceType   || null,
        target_date:    targetDate    || null,
        quoted_amount:  Math.round(parseFloat(quotedAmount || '0') * 100),
        payment_status: paymentStatus as any,
        status:         projectStatus as any,
        notes:          notes.trim()  || null,
      } as any)
      toast.success('Project updated')
    } catch (err: any) {
      toast.error('Failed to update', err.message)
    } finally {
      setSavingDetails(false)
    }
  }

  // ── Save all stage overrides ───────────────────────────────────────────
  const saveStages = async () => {
    setSavingStages(true)
    try {
      const changed = sortedStages.filter(s => s.status !== stageStatuses[s.id])
      if (changed.length === 0) { toast.success('No changes to save'); setSavingStages(false); return }
      await Promise.all(
        changed.map(s =>
          updateStage.mutateAsync({
            id:        s.id,
            projectId: project.id,
            status:    stageStatuses[s.id],
          })
        )
      )
      toast.success(`${changed.length} stage${changed.length > 1 ? 's' : ''} updated`)
    } catch (err: any) {
      toast.error('Failed to update stages', err.message)
    } finally {
      setSavingStages(false)
    }
  }

  const changedStageCount = sortedStages.filter(s => s.status !== stageStatuses[s.id]).length

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-display font-semibold text-brand-950">Edit Project</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">{project.project_code} · {project.service_type}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-brand-950">
            <Sym name="close" size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 shrink-0">
          {(['details', 'stages'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-1.5 text-xs font-medium rounded-lg capitalize transition-all',
                tab === t ? 'bg-brand-600 text-white' : 'text-muted-foreground hover:bg-[#F8FAFC]'
              )}
            >
              {t === 'details' ? 'Project Details' : `Stage Overrides${changedStageCount > 0 ? ` (${changedStageCount} changed)` : ''}`}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── PROJECT DETAILS ────────────────────────────────────────── */}
          {tab === 'details' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">

                <Field label="Project Type">
                  <select value={serviceType} onChange={e => setServiceType(e.target.value)} className={ic}>
                    {SERVICE_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </Field>

                <Field label="Project Status">
                  <select value={projectStatus} onChange={e => setProjectStatus(e.target.value)} className={ic}>
                    <option value="active">Active</option>
                    <option value="on_hold">On Hold</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </Field>

                <Field label="Assigned Executive">
                  <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className={ic}>
                    <option value="">— Unassigned —</option>
                    {executives.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </Field>

                <Field label="Manager">
                  <select value={managerId} onChange={e => setManagerId(e.target.value)} className={ic}>
                    <option value="">— Unassigned —</option>
                    {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </Field>

                <Field label="Target Date">
                  <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className={ic} />
                </Field>

                <Field label="Quoted Amount (₹)">
                  <input type="number" value={quotedAmount} onChange={e => setQuotedAmount(e.target.value)} className={ic} placeholder="0" min="0" />
                </Field>

                <Field label="Payment Status">
                  <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)} className={ic}>
                    {PAYMENT_STATUSES.map(s => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </Field>

              </div>

              <Field label="Notes">
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={ic} placeholder="Internal notes…" />
              </Field>

              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
                <Sym name="info" size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Changing <strong>Project Status to Completed</strong> does not auto-complete stages. Use the Stage Overrides tab to reset individual stage statuses if needed.
                </p>
              </div>
            </div>
          )}

          {/* ── STAGE OVERRIDES ────────────────────────────────────────── */}
          {tab === 'stages' && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-3">
                Override the status of any stage. Changes are saved together when you click Save Stages.
                Use this to reset a stuck stage, mark it as not required, or reopen a completed stage.
              </p>
              {sortedStages.map((stage, idx) => {
                const current   = stage.status as StageStatus
                const override  = stageStatuses[stage.id]
                const changed   = current !== override
                return (
                  <div
                    key={stage.id}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-lg border transition-all',
                      changed ? 'border-brand-400 bg-brand-50' : 'border-border bg-[#F8FAFC]'
                    )}
                  >
                    <span className="w-5 text-[11px] text-muted-foreground text-center font-mono shrink-0">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-brand-950 truncate">{stage.stage_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', STATUS_COLORS[current])}>
                          {STATUS_LABELS[current]}
                        </span>
                        {changed && (
                          <>
                            <Sym name="arrow_forward" size={10} className="text-muted-foreground" />
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium ring-1 ring-brand-400', STATUS_COLORS[override])}>
                              {STATUS_LABELS[override]}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <select
                      value={override}
                      onChange={e => setStageStatuses(prev => ({ ...prev, [stage.id]: e.target.value as StageStatus }))}
                      className="text-xs border border-border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 shrink-0"
                    >
                      {(Object.keys(STATUS_LABELS) as StageStatus[]).map(s => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                )
              })}
              {sortedStages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No stages found for this project.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">
            Cancel
          </button>
          {tab === 'details' && (
            <button
              onClick={saveDetails}
              disabled={savingDetails}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2"
            >
              {savingDetails && <Sym name="progress_activity" size={13} className="animate-spin" />}
              {savingDetails ? 'Saving…' : 'Save Project'}
            </button>
          )}
          {tab === 'stages' && (
            <button
              onClick={saveStages}
              disabled={savingStages || changedStageCount === 0}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2"
            >
              {savingStages && <Sym name="progress_activity" size={13} className="animate-spin" />}
              {savingStages ? 'Saving…' : changedStageCount > 0 ? `Save ${changedStageCount} Stage${changedStageCount > 1 ? 's' : ''}` : 'No Changes'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-brand-950 mb-1">{label}</label>
      {children}
    </div>
  )
}

const ic = 'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'
