// HRMS — Training (M7): training calendar/list + enrolment management (/hrms/training).
// View gated hrms.training.view; create/manage gated hrms.training.manage.
import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useCan } from '@/core/access/useCan'
import { useEmployees } from '../hooks/useEmployees'
import {
  useTrainings, useCreateTraining, useUpdateTraining, useSetTrainingStatus,
  useEnrolments, useNominate, useCompleteEnrolment, useRemoveEnrolment,
} from '../hooks/useTraining'
import type { Training, TrainingInput, TrainingType, TrainingStatus } from '../api/training'
import { StatusPill, TypePill, inputCls, parseScore, istToday } from './trainingShared'
import { fmtPaise } from './payrollShared'

const TYPES: TrainingType[] = ['internal', 'external']

export default function TrainingPage() {
  const canManage = useCan('hrms.training.manage')
  const { data: trainings = [], isLoading } = useTrainings()
  const create = useCreateTraining()
  const update = useUpdateTraining()
  const setStatus = useSetTrainingStatus()

  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<{ title: string; type: TrainingType; trainer: string; start_date: string; end_date: string; cost_rupees: string; status: TrainingStatus }>({
    title: '', type: 'internal', trainer: '', start_date: istToday(), end_date: istToday(), cost_rupees: '', status: 'planned',
  })
  const [selected, setSelected] = useState<Training | null>(null)

  const startCreate = () => { setEditId(null); setForm({ title: '', type: 'internal', trainer: '', start_date: istToday(), end_date: istToday(), cost_rupees: '', status: 'planned' }); setOpen(true) }
  const startEdit = (t: Training) => { setEditId(t.id); setForm({ title: t.title, type: t.type, trainer: t.trainer ?? '', start_date: t.start_date ?? istToday(), end_date: t.end_date ?? istToday(), cost_rupees: t.cost ? String(t.cost / 100) : '', status: t.status }); setOpen(true) }
  const submit = async () => {
    // status is not part of TrainingInput — create starts 'planned'; status changes go via setTrainingStatus.
    const payload: TrainingInput = { title: form.title.trim(), type: form.type, trainer: form.trainer.trim() || null, start_date: form.start_date || null, end_date: form.end_date || null, cost: Math.round((Number(form.cost_rupees) || 0) * 100) }
    if (editId) {
      await update.mutateAsync({ id: editId, input: payload })
      await setStatus.mutateAsync({ id: editId, status: form.status })
    } else {
      await create.mutateAsync(payload)
    }
    setOpen(false)
  }

  return (
    <div>
      <TopBar title="Training & Development" subtitle="Internal & external training">
        {canManage && <button onClick={startCreate} className="flex items-center gap-1.5 px-3 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700"><Sym name="add" size={15} /> New Training</button>}
      </TopBar>
      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-border rounded-xl bg-white overflow-hidden">
          <div className="px-4 py-2 bg-[#F8FAFC] text-xs font-semibold text-brand-950">Trainings</div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {isLoading && <tr><td className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && trainings.length === 0 && <tr><td className="px-4 py-6 text-center text-muted-foreground">No trainings.</td></tr>}
              {trainings.map((t) => (
                <tr key={t.id} className={`hover:bg-[#F8FAFC] cursor-pointer ${selected?.id === t.id ? 'bg-[#F8FAFC]' : ''}`} onClick={() => setSelected(t)}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-brand-950">{t.title}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2"><TypePill type={t.type} /> {t.start_date} · {fmtPaise(t.cost)}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right"><StatusPill status={t.status} /></td>
                  {canManage && <td className="px-2 py-2.5 text-right"><button onClick={(e) => { e.stopPropagation(); startEdit(t) }} className="text-muted-foreground hover:text-brand-700"><Sym name="edit" size={15} /></button></td>}
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
        {selected && <EnrolmentPanel training={selected} canManage={canManage} onSetStatus={(s) => setStatus.mutate({ id: selected.id, status: s })} />}
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-3">
            <h2 className="font-display font-semibold text-brand-950">{editId ? 'Edit' : 'New'} Training</h2>
            <input className={inputCls} placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <select className={inputCls} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as TrainingType }))}>{TYPES.map((x) => <option key={x} value={x}>{x}</option>)}</select>
              <input className={inputCls} placeholder="Trainer" value={form.trainer} onChange={(e) => setForm((f) => ({ ...f, trainer: e.target.value }))} />
              <input type="date" className={inputCls} value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
              <input type="date" className={inputCls} value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
              <input type="number" className={inputCls} placeholder="Cost ₹" value={form.cost_rupees} onChange={(e) => setForm((f) => ({ ...f, cost_rupees: e.target.value }))} />
              <select className={inputCls} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as TrainingStatus }))}>{['planned', 'ongoing', 'completed', 'cancelled'].map((x) => <option key={x} value={x}>{x}</option>)}</select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={submit} disabled={form.title.trim().length < 2} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EnrolmentPanel({ training, canManage, onSetStatus }: { training: Training; canManage: boolean; onSetStatus: (s: TrainingStatus) => void }) {
  const { data: employees = [] } = useEmployees()
  const { data: enrolments = [] } = useEnrolments(training.id)
  const nominate = useNominate(training.id)
  const complete = useCompleteEnrolment(training.id)
  const remove = useRemoveEnrolment(training.id)
  const [pick, setPick] = useState('')
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? id.slice(0, 8)
  const enrolledIds = new Set(enrolments.map((e: any) => e.employee_id))

  return (
    <div className="border border-border rounded-xl bg-white overflow-hidden">
      <div className="px-4 py-2 bg-[#F8FAFC] text-xs font-semibold text-brand-950 flex items-center justify-between">
        <span>Enrolments — {training.title}</span>
        {canManage && training.status !== 'completed' && <button onClick={() => onSetStatus('completed')} className="text-[11px] text-brand-700 hover:underline">Mark completed</button>}
      </div>
      {canManage && (
        <div className="px-4 py-2 flex gap-2 border-b border-border">
          <select className={`${inputCls} flex-1`} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Nominate employee…</option>
            {employees.filter((e) => !enrolledIds.has(e.id)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <button onClick={() => { if (pick) { nominate.mutate({ training_id: training.id, employee_id: pick }); setPick('') } }} disabled={!pick} className="px-3 py-1.5 bg-brand-600 text-white text-xs rounded-lg disabled:opacity-50">Add</button>
        </div>
      )}
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <tbody className="divide-y divide-border">
          {enrolments.length === 0 && <tr><td className="px-4 py-4 text-muted-foreground text-center">No enrolments.</td></tr>}
          {enrolments.map((en: any) => (
            <tr key={en.id}>
              <td className="px-4 py-2">{nameOf(en.employee_id)}</td>
              <td className="px-2 py-2"><StatusPill status={en.status} /></td>
              <td className="px-2 py-2 text-right text-muted-foreground">{en.score != null ? en.score : '—'}</td>
              {canManage && (
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <button onClick={() => complete.mutate({ id: en.id, score: parseScore(prompt('Score (optional)') ?? '') })} className="text-[11px] text-emerald-700 hover:underline mr-2">Complete</button>
                  <button onClick={() => remove.mutate(en.id)} className="text-muted-foreground hover:text-red-600"><Sym name="delete" size={14} /></button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  )
}
