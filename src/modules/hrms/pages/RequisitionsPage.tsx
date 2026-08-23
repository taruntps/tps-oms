// HRMS — Job Requisitions (/hrms/recruit/requisitions).
// Internal recruitment demand: raise a requisition (dept/designation/grade/headcount/
// budget CTC/justification), submit for approval, and (with hrms.recruitment.approve)
// approve/reject. Single-level approval (approved_by + status). Manage gated by
// hrms.recruitment.manage.
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useCan } from '@/core/access/useCan'
import { useDepartments, useDesignations, useGrades } from '../hooks/useMasters'
import {
  useRequisitions,
  useCreateRequisition,
  useSubmitRequisition,
  useDecideRequisition,
  useSetRequisitionStatus,
} from '../hooks/useRecruitment'
import { fmtPaise } from './payrollShared'
import { StatusPill, inputCls, rupeesToPaise } from './recruitShared'
import type { RequisitionInput } from '../api/recruitment'

export default function RequisitionsPage() {
  const { user } = useAuth()
  const canManage = useCan('hrms.recruitment.manage')
  const canApprove = useCan('hrms.recruitment.approve')

  const { data: requisitions = [], isLoading } = useRequisitions()
  const { data: departments = [] } = useDepartments()
  const { data: designations = [] } = useDesignations()
  const { data: grades = [] } = useGrades()

  const [showForm, setShowForm] = useState(false)

  const submit = useSubmitRequisition()
  const decide = useDecideRequisition(user?.id)
  const setStatus = useSetRequisitionStatus()

  const deptName = useMemo(() => new Map(departments.map(d => [d.id, d.name])), [departments])
  const desigName = useMemo(() => new Map(designations.map(d => [d.id, d.name])), [designations])
  const gradeName = useMemo(() => new Map(grades.map(g => [g.id, g.name])), [grades])

  const pendingCount = requisitions.filter(r => r.status === 'pending').length

  return (
    <div>
      <TopBar title="Job Requisitions" subtitle={`${requisitions.length} requisition${requisitions.length === 1 ? '' : 's'} · ${pendingCount} pending`} />

      <div className="p-6 animate-fade-up space-y-5">
        {canManage && (
          <div className="flex justify-end">
            <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors">
              <Sym name="add" size={16} /> New Requisition
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-white rounded-lg border border-border animate-pulse" />)}</div>
        ) : requisitions.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
            <Sym name="work" size={30} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No requisitions yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Designation</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Grade</th>
                  <th className="px-4 py-3 font-medium">Headcount</th>
                  <th className="px-4 py-3 font-medium">Budget CTC</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Raised</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requisitions.map(r => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-brand-950">{(r.designation_id && desigName.get(r.designation_id)) || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{(r.department_id && deptName.get(r.department_id)) || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{(r.grade_id && gradeName.get(r.grade_id)) || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.headcount}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.budget_ctc != null ? fmtPaise(r.budget_ctc) : '—'}</td>
                    <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {canManage && r.status === 'draft' && (
                          <button onClick={() => submit.mutate(r.id)} disabled={submit.isPending} className="flex items-center gap-1 px-2.5 py-1 text-xs border border-border rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50">
                            <Sym name="send" size={13} /> Submit
                          </button>
                        )}
                        {canApprove && r.status === 'pending' && user?.id && (
                          <>
                            <button onClick={() => decide.mutate({ id: r.id, approve: false })} disabled={decide.isPending} className="flex items-center gap-1 px-2.5 py-1 text-xs border border-border rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50">
                              <Sym name="close" size={13} /> Reject
                            </button>
                            <button onClick={() => decide.mutate({ id: r.id, approve: true })} disabled={decide.isPending} className="flex items-center gap-1 px-2.5 py-1 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                              <Sym name="check" size={13} /> Approve
                            </button>
                          </>
                        )}
                        {canManage && r.status === 'approved' && (
                          <>
                            <button onClick={() => setStatus.mutate({ id: r.id, status: 'on_hold' })} disabled={setStatus.isPending} className="px-2.5 py-1 text-xs border border-border rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50">Hold</button>
                            <button onClick={() => setStatus.mutate({ id: r.id, status: 'closed' })} disabled={setStatus.isPending} className="px-2.5 py-1 text-xs border border-border rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50">Close</button>
                          </>
                        )}
                        {canManage && r.status === 'on_hold' && (
                          <button onClick={() => setStatus.mutate({ id: r.id, status: 'approved' })} disabled={setStatus.isPending} className="px-2.5 py-1 text-xs border border-border rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50">Resume</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && canManage && <RequisitionForm onClose={() => setShowForm(false)} />}
    </div>
  )
}

function RequisitionForm({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const { data: departments = [] } = useDepartments()
  const { data: designations = [] } = useDesignations()
  const { data: grades = [] } = useGrades()
  const create = useCreateRequisition(user?.id)

  const [form, setForm] = useState<{ department_id: string; designation_id: string; grade_id: string; headcount: string; budget_ctc: string; justification: string }>({
    department_id: '', designation_id: '', grade_id: '', headcount: '1', budget_ctc: '', justification: '',
  })

  const submit = () => {
    const input: RequisitionInput = {
      department_id: form.department_id || null,
      designation_id: form.designation_id || null,
      grade_id: form.grade_id || null,
      headcount: Math.max(1, Number(form.headcount) || 1),
      budget_ctc: rupeesToPaise(form.budget_ctc),
      justification: form.justification.trim() || null,
    }
    create.mutate(input, { onSuccess: onClose })
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">New Requisition</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <Field label="Department">
            <select value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })} className={inputCls}>
              <option value="">—</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Designation">
            <select value={form.designation_id} onChange={e => setForm({ ...form, designation_id: e.target.value })} className={inputCls}>
              <option value="">—</option>
              {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Grade">
            <select value={form.grade_id} onChange={e => setForm({ ...form, grade_id: e.target.value })} className={inputCls}>
              <option value="">—</option>
              {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Headcount">
              <input type="number" min={1} value={form.headcount} onChange={e => setForm({ ...form, headcount: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Budget CTC (₹/yr)">
              <input type="number" min={0} value={form.budget_ctc} onChange={e => setForm({ ...form, budget_ctc: e.target.value })} placeholder="e.g. 600000" className={inputCls} />
            </Field>
          </div>
          <Field label="Justification">
            <textarea rows={3} value={form.justification} onChange={e => setForm({ ...form, justification: e.target.value })} className={inputCls} />
          </Field>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={submit} disabled={create.isPending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">Create</button>
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
