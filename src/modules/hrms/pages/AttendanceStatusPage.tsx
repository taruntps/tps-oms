// HRMS — Attendance Status master (/hrms/setup/attendance-status), gate hrms.config.manage.
// M3 configurability enhancement: manage the hr_attendance_statuses + hr_day_types masters
// (code/label/category/is_paid/is_working/sort_order/active). These normalise the status
// vocabulary frozen M2 carries as a CHECK constraint (M2 itself is not modified).
import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useCan } from '@/core/access/useCan'
import {
  useAttendanceStatuses,
  useUpsertAttendanceStatus,
  useDeactivateAttendanceStatus,
  useDayTypes,
  useUpsertDayType,
  useDeactivateDayType,
} from '../hooks/useLeaveConfig'
import type { AttendanceStatusMaster, DayTypeMaster } from '../api/leaveConfig'

const ic =
  'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'

const CATEGORIES = ['present', 'absent', 'leave', 'holiday', 'off', 'exception'] as const

export default function AttendanceStatusPage() {
  const canManage = useCan('hrms.config.manage')
  const [section, setSection] = useState<'statuses' | 'day_types'>('statuses')

  return (
    <div>
      <TopBar title="Attendance Status" subtitle="Configurable status & day-type masters" />

      <div className="p-6 animate-fade-up">
        {!canManage && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
            You have read-only access to the status masters.
          </div>
        )}

        <div className="flex gap-1 overflow-x-auto border-b border-border mb-5">
          {([['statuses', 'Attendance Statuses', 'rule'], ['day_types', 'Day Types', 'today']] as const).map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                section === id ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted-foreground hover:text-brand-950'
              }`}
            >
              <Sym name={icon} size={15} /> {label}
            </button>
          ))}
        </div>

        {section === 'statuses' ? <StatusMaster canManage={canManage} /> : <DayTypeMasterCrud canManage={canManage} />}
      </div>
    </div>
  )
}

// ── Attendance statuses ─────────────────────────────────────────────────────────
function StatusMaster({ canManage }: { canManage: boolean }) {
  const { data: rows = [], isLoading } = useAttendanceStatuses()
  const upsert = useUpsertAttendanceStatus()
  const deactivate = useDeactivateAttendanceStatus()
  const [editing, setEditing] = useState<AttendanceStatusMaster | 'new' | null>(null)
  const [form, setForm] = useState<Record<string, any>>({})

  const openNew = () => { setForm({ code: '', label: '', category: 'present', is_paid: true, sort_order: (rows.length + 1), is_active: true }); setEditing('new') }
  const openEdit = (r: AttendanceStatusMaster) => { setForm({ ...r }); setEditing(r) }
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  const canSave = String(form.code ?? '').trim() && String(form.label ?? '').trim()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    const payload = {
      code: String(form.code).trim(),
      label: String(form.label).trim(),
      category: form.category,
      is_paid: !!form.is_paid,
      sort_order: Number(form.sort_order) || 0,
      is_active: !!form.is_active,
    }
    try {
      if (editing === 'new') await upsert.mutateAsync(payload)
      else if (editing) await upsert.mutateAsync({ id: editing.id, ...payload })
      setEditing(null)
    } catch { /* toast surfaced by hook */ }
  }

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <p className="text-sm font-semibold text-brand-950">Attendance Statuses</p>
        {canManage && (
          <button onClick={openNew} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-[#F8FAFC]">
            <Sym name="add" size={14} /> Add Status
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="p-5 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-[#F8FAFC] rounded animate-pulse" />)}</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2.5 font-medium">Code</th>
              <th className="px-5 py-2.5 font-medium">Label</th>
              <th className="px-5 py-2.5 font-medium">Category</th>
              <th className="px-5 py-2.5 font-medium">Paid</th>
              <th className="px-5 py-2.5 font-medium">Order</th>
              <th className="px-5 py-2.5 font-medium">Active</th>
              {canManage && <th className="px-5 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-5 py-2.5 font-mono text-brand-950">{r.code}</td>
                <td className="px-5 py-2.5 text-brand-950">{r.label}</td>
                <td className="px-5 py-2.5 text-muted-foreground capitalize">{r.category}</td>
                <td className="px-5 py-2.5 text-muted-foreground">{r.is_paid ? 'Yes' : 'No'}</td>
                <td className="px-5 py-2.5 text-muted-foreground">{r.sort_order}</td>
                <td className="px-5 py-2.5">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${r.is_active ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>{r.is_active ? 'Active' : 'Inactive'}</span>
                </td>
                {canManage && (
                  <td className="px-5 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(r)} title="Edit" className="p-1.5 rounded-lg text-muted-foreground hover:bg-[#F8FAFC] hover:text-brand-950"><Sym name="edit" size={14} /></button>
                      {r.is_active && <button onClick={() => deactivate.mutate(r.id)} title="Deactivate" className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600"><Sym name="block" size={14} /></button>}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-display font-semibold text-brand-950">{editing === 'new' ? 'Add Status' : 'Edit Status'}</h2>
              <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
            </div>
            <form onSubmit={submit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-brand-950 mb-1">Code *</label>
                  <input className={ic} value={form.code ?? ''} onChange={e => set('code', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-brand-950 mb-1">Sort order</label>
                  <input type="number" className={ic} value={form.sort_order ?? 0} onChange={e => set('sort_order', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-950 mb-1">Label *</label>
                <input className={ic} value={form.label ?? ''} onChange={e => set('label', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-950 mb-1">Category</label>
                <select className={ic} value={form.category ?? 'present'} onChange={e => set('category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-brand-950"><input type="checkbox" checked={!!form.is_paid} onChange={e => set('is_paid', e.target.checked)} /> Paid</label>
                <label className="flex items-center gap-2 text-sm text-brand-950"><input type="checkbox" checked={!!form.is_active} onChange={e => set('is_active', e.target.checked)} /> Active</label>
              </div>
            </form>
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <button onClick={() => setEditing(null)} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={submit} disabled={!canSave || upsert.isPending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">{upsert.isPending ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Day types ────────────────────────────────────────────────────────────────────
function DayTypeMasterCrud({ canManage }: { canManage: boolean }) {
  const { data: rows = [], isLoading } = useDayTypes()
  const upsert = useUpsertDayType()
  const deactivate = useDeactivateDayType()
  const [editing, setEditing] = useState<DayTypeMaster | 'new' | null>(null)
  const [form, setForm] = useState<Record<string, any>>({})

  const openNew = () => { setForm({ code: '', label: '', is_working: true, sort_order: (rows.length + 1), is_active: true }); setEditing('new') }
  const openEdit = (r: DayTypeMaster) => { setForm({ ...r }); setEditing(r) }
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  const canSave = String(form.code ?? '').trim() && String(form.label ?? '').trim()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    const payload = {
      code: String(form.code).trim(),
      label: String(form.label).trim(),
      is_working: !!form.is_working,
      sort_order: Number(form.sort_order) || 0,
      is_active: !!form.is_active,
    }
    try {
      if (editing === 'new') await upsert.mutateAsync(payload)
      else if (editing) await upsert.mutateAsync({ id: editing.id, ...payload })
      setEditing(null)
    } catch { /* toast surfaced by hook */ }
  }

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <p className="text-sm font-semibold text-brand-950">Day Types</p>
        {canManage && (
          <button onClick={openNew} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-[#F8FAFC]">
            <Sym name="add" size={14} /> Add Day Type
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="p-5 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-[#F8FAFC] rounded animate-pulse" />)}</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2.5 font-medium">Code</th>
              <th className="px-5 py-2.5 font-medium">Label</th>
              <th className="px-5 py-2.5 font-medium">Working</th>
              <th className="px-5 py-2.5 font-medium">Order</th>
              <th className="px-5 py-2.5 font-medium">Active</th>
              {canManage && <th className="px-5 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-5 py-2.5 font-mono text-brand-950">{r.code}</td>
                <td className="px-5 py-2.5 text-brand-950">{r.label}</td>
                <td className="px-5 py-2.5 text-muted-foreground">{r.is_working ? 'Yes' : 'No'}</td>
                <td className="px-5 py-2.5 text-muted-foreground">{r.sort_order}</td>
                <td className="px-5 py-2.5">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${r.is_active ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>{r.is_active ? 'Active' : 'Inactive'}</span>
                </td>
                {canManage && (
                  <td className="px-5 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(r)} title="Edit" className="p-1.5 rounded-lg text-muted-foreground hover:bg-[#F8FAFC] hover:text-brand-950"><Sym name="edit" size={14} /></button>
                      {r.is_active && <button onClick={() => deactivate.mutate(r.id)} title="Deactivate" className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600"><Sym name="block" size={14} /></button>}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-display font-semibold text-brand-950">{editing === 'new' ? 'Add Day Type' : 'Edit Day Type'}</h2>
              <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
            </div>
            <form onSubmit={submit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-brand-950 mb-1">Code *</label>
                  <input className={ic} value={form.code ?? ''} onChange={e => set('code', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-brand-950 mb-1">Sort order</label>
                  <input type="number" className={ic} value={form.sort_order ?? 0} onChange={e => set('sort_order', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-950 mb-1">Label *</label>
                <input className={ic} value={form.label ?? ''} onChange={e => set('label', e.target.value)} />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-brand-950"><input type="checkbox" checked={!!form.is_working} onChange={e => set('is_working', e.target.checked)} /> Working day</label>
                <label className="flex items-center gap-2 text-sm text-brand-950"><input type="checkbox" checked={!!form.is_active} onChange={e => set('is_active', e.target.checked)} /> Active</label>
              </div>
            </form>
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <button onClick={() => setEditing(null)} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={submit} disabled={!canSave || upsert.isPending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">{upsert.isPending ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
