// HRMS — Shifts (/hrms/attendance/shifts), gate hrms.shift.manage.
// CRUD the hr_shifts catalogue + allocate shifts to employees (hr_shift_allocations,
// effective-dated). The 'general' 09:00–18:00 shift is seeded by migration 089.
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { formatDate } from '@/lib/utils'
import { useCan } from '@/core/access/useCan'
import {
  useShifts,
  useUpsertShift,
  useDeactivateShift,
  useShiftAllocations,
  useCreateShiftAllocation,
  useDeleteShiftAllocation,
} from '../hooks/useShifts'
import { useEmployees } from '../hooks/useEmployees'
import { istToday } from './attendanceShared'
import type { Shift } from '../api/shifts'

const ic =
  'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'

export default function ShiftsPage() {
  const canManage = useCan('hrms.shift.manage')
  const { data: shifts = [], isLoading } = useShifts()
  const { data: allocations = [] } = useShiftAllocations()
  const { data: employees = [] } = useEmployees()
  const upsert = useUpsertShift()
  const deactivate = useDeactivateShift()
  const createAlloc = useCreateShiftAllocation()
  const deleteAlloc = useDeleteShiftAllocation()

  const [editing, setEditing] = useState<Shift | 'new' | null>(null)
  const [allocOpen, setAllocOpen] = useState(false)

  const shiftName = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of shifts) m.set(s.id, `${s.name} (${s.start_time?.slice(0, 5)}–${s.end_time?.slice(0, 5)})`)
    return m
  }, [shifts])
  const empName = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of employees) m.set(e.id, e.name ?? e.employee_code ?? e.id.slice(0, 8))
    return m
  }, [employees])

  return (
    <div>
      <TopBar title="Shifts" subtitle="Shift catalogue & employee allocations" />

      <div className="p-6 animate-fade-up space-y-6">
        {/* Shifts */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-brand-950">Shift Catalogue</h2>
            {canManage && (
              <button onClick={() => setEditing('new')} className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">
                <Sym name="add" size={16} /> New Shift
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-white rounded-lg border border-border animate-pulse" />)}</div>
          ) : (
            <div className="bg-white rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Timing</th>
                    <th className="px-4 py-3 font-medium">Break</th>
                    <th className="px-4 py-3 font-medium">Night</th>
                    <th className="px-4 py-3 font-medium">Active</th>
                    {canManage && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {shifts.map(s => (
                    <tr key={s.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.code}</td>
                      <td className="px-4 py-3 font-medium text-brand-950">{s.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.break_minutes}m</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.is_night ? 'Yes' : 'No'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${s.is_active ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                          {s.is_active ? 'active' : 'inactive'}
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button onClick={() => setEditing(s)} title="Edit" className="p-1.5 rounded-lg text-muted-foreground hover:bg-[#F8FAFC] hover:text-brand-950"><Sym name="edit" size={14} /></button>
                          {s.is_active && <button onClick={() => deactivate.mutate(s.id)} title="Deactivate" className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600"><Sym name="block" size={14} /></button>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Allocations */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-brand-950">Shift Allocations</h2>
            {canManage && (
              <button onClick={() => setAllocOpen(true)} className="flex items-center gap-2 px-4 py-2 border border-border text-sm font-medium rounded-lg hover:bg-[#F8FAFC]">
                <Sym name="assignment_ind" size={16} /> Allocate Shift
              </button>
            )}
          </div>

          {allocations.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">No shift allocations. Employees fall back to policy defaults.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Employee</th>
                    <th className="px-4 py-3 font-medium">Shift</th>
                    <th className="px-4 py-3 font-medium">Effective From</th>
                    <th className="px-4 py-3 font-medium">Effective To</th>
                    {canManage && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {allocations.map(a => (
                    <tr key={a.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-brand-950">{empName.get(a.employee_id) ?? a.employee_id.slice(0, 8)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{shiftName.get(a.shift_id) ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(a.effective_from)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.effective_to ? formatDate(a.effective_to) : 'Open'}</td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => deleteAlloc.mutate(a.id)} title="Remove" className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600"><Sym name="delete" size={14} /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {editing && (
        <ShiftModal
          shift={editing === 'new' ? null : editing}
          saving={upsert.isPending}
          onClose={() => setEditing(null)}
          onSave={async (input) => { await upsert.mutateAsync(editing === 'new' ? input : { id: editing.id, ...input }); setEditing(null) }}
        />
      )}

      {allocOpen && (
        <AllocationModal
          shifts={shifts.filter(s => s.is_active)}
          employees={employees.map(e => ({ id: e.id, name: e.name ?? e.employee_code ?? e.id.slice(0, 8) }))}
          saving={createAlloc.isPending}
          onClose={() => setAllocOpen(false)}
          onSave={async (input) => { await createAlloc.mutateAsync(input); setAllocOpen(false) }}
        />
      )}
    </div>
  )
}

function ShiftModal({ shift, saving, onClose, onSave }: {
  shift: Shift | null; saving: boolean; onClose: () => void
  onSave: (input: { code: string; name: string; start_time: string; end_time: string; break_minutes: number; is_night: boolean; is_active: boolean }) => void
}) {
  const [form, setForm] = useState({
    code: shift?.code ?? '',
    name: shift?.name ?? '',
    start_time: shift?.start_time?.slice(0, 5) ?? '09:00',
    end_time: shift?.end_time?.slice(0, 5) ?? '18:00',
    break_minutes: String(shift?.break_minutes ?? 60),
    is_night: shift?.is_night ?? false,
    is_active: shift?.is_active ?? true,
  })
  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))
  const canSave = form.code.trim() !== '' && form.name.trim() !== ''

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    onSave({
      code: form.code.trim(), name: form.name.trim(),
      start_time: form.start_time, end_time: form.end_time,
      break_minutes: Number(form.break_minutes) || 0,
      is_night: form.is_night, is_active: form.is_active,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">{shift ? 'Edit Shift' : 'New Shift'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-brand-950 mb-1">Code *</label><input className={ic} value={form.code} onChange={e => set('code', e.target.value)} /></div>
            <div><label className="block text-xs font-medium text-brand-950 mb-1">Name *</label><input className={ic} value={form.name} onChange={e => set('name', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-brand-950 mb-1">Start</label><input type="time" className={ic} value={form.start_time} onChange={e => set('start_time', e.target.value)} /></div>
            <div><label className="block text-xs font-medium text-brand-950 mb-1">End</label><input type="time" className={ic} value={form.end_time} onChange={e => set('end_time', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4 items-end">
            <div><label className="block text-xs font-medium text-brand-950 mb-1">Break (min)</label><input type="number" min={0} className={ic} value={form.break_minutes} onChange={e => set('break_minutes', e.target.value)} /></div>
            <div className="flex items-center gap-4 pb-2">
              <label className="flex items-center gap-2 text-sm text-brand-950"><input type="checkbox" checked={form.is_night} onChange={e => set('is_night', e.target.checked)} /> Night</label>
              <label className="flex items-center gap-2 text-sm text-brand-950"><input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} /> Active</label>
            </div>
          </div>
        </form>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={submit} disabled={!canSave || saving} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

function AllocationModal({ shifts, employees, saving, onClose, onSave }: {
  shifts: Shift[]; employees: { id: string; name: string }[]; saving: boolean; onClose: () => void
  onSave: (input: { employee_id: string; shift_id: string; effective_from: string; effective_to: string | null }) => void
}) {
  const [form, setForm] = useState({ employee_id: '', shift_id: '', effective_from: istToday(), effective_to: '' })
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))
  const canSave = form.employee_id !== '' && form.shift_id !== '' && form.effective_from !== ''

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    onSave({ employee_id: form.employee_id, shift_id: form.shift_id, effective_from: form.effective_from, effective_to: form.effective_to || null })
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">Allocate Shift</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Employee *</label>
            <select className={ic} value={form.employee_id} onChange={e => set('employee_id', e.target.value)}>
              <option value="">Select…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Shift *</label>
            <select className={ic} value={form.shift_id} onChange={e => set('shift_id', e.target.value)}>
              <option value="">Select…</option>
              {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-brand-950 mb-1">Effective From *</label><input type="date" className={ic} value={form.effective_from} onChange={e => set('effective_from', e.target.value)} /></div>
            <div><label className="block text-xs font-medium text-brand-950 mb-1">Effective To</label><input type="date" className={ic} value={form.effective_to} onChange={e => set('effective_to', e.target.value)} /></div>
          </div>
        </form>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={submit} disabled={!canSave || saving} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">{saving ? 'Saving…' : 'Allocate'}</button>
        </div>
      </div>
    </div>
  )
}
