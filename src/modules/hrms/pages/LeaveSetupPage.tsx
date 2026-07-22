// HRMS — Leave Setup (/hrms/leave/setup), gate hrms.leave.manage.
// Four sections: leave-type CRUD, holiday calendar CRUD, balance admin (manual ledger
// opening/accrual/adjustment entries — automated accrual is deferred), and encashment
// approvals (amount left null for Payroll to compute).
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useCan } from '@/core/access/useCan'
import { useEmployees } from '../hooks/useEmployees'
import {
  useAllLeaveTypes,
  useUpsertLeaveType,
  useDeactivateLeaveType,
  useHolidays,
  useUpsertHoliday,
  useDeactivateHoliday,
} from '../hooks/useLeaveConfig'
import {
  useActiveLeaveTypes,
  usePostLedgerEntry,
  useLeaveBalances,
  useEncashments,
  useDecideEncashment,
} from '../hooks/useLeave'
import { EncashmentStatusPill, fmtDays, istToday, istYear } from './leaveShared'
import type { LeaveType } from '../api/leave'
import type { Holiday } from '../api/leaveConfig'

const ic =
  'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'

const SECTIONS = ['types', 'holidays', 'balances', 'encashments'] as const
type SectionId = (typeof SECTIONS)[number]
const SECTION_META: Record<SectionId, { label: string; icon: string }> = {
  types: { label: 'Leave Types', icon: 'category' },
  holidays: { label: 'Holidays', icon: 'event' },
  balances: { label: 'Balance Admin', icon: 'account_balance_wallet' },
  encashments: { label: 'Encashments', icon: 'payments' },
}

export default function LeaveSetupPage() {
  const canManage = useCan('hrms.leave.manage')
  const [section, setSection] = useState<SectionId>('types')

  return (
    <div>
      <TopBar title="Leave Setup" subtitle="Leave types, holidays, balances & encashments" />

      <div className="p-6 animate-fade-up">
        {!canManage && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
            You have read-only access to leave setup.
          </div>
        )}

        <div className="flex gap-1 overflow-x-auto border-b border-border mb-5">
          {SECTIONS.map(s => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                section === s ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted-foreground hover:text-brand-950'
              }`}
            >
              <Sym name={SECTION_META[s].icon} size={15} /> {SECTION_META[s].label}
            </button>
          ))}
        </div>

        {section === 'types' && <LeaveTypesSection canManage={canManage} />}
        {section === 'holidays' && <HolidaysSection canManage={canManage} />}
        {section === 'balances' && <BalanceAdminSection canManage={canManage} />}
        {section === 'encashments' && <EncashmentsSection canManage={canManage} />}
      </div>
    </div>
  )
}

// ── Leave types ──────────────────────────────────────────────────────────────────
function LeaveTypesSection({ canManage }: { canManage: boolean }) {
  const { data: rows = [], isLoading } = useAllLeaveTypes()
  const upsert = useUpsertLeaveType()
  const deactivate = useDeactivateLeaveType()
  const [editing, setEditing] = useState<LeaveType | 'new' | null>(null)
  const [form, setForm] = useState<Record<string, any>>({})

  const openNew = () => { setForm({ code: '', name: '', is_paid: true, is_encashable: false, requires_proof: false, unit: 'day', applies_to: 'all', annual_quota: 0, carry_forward_cap: 0, is_active: true }); setEditing('new') }
  const openEdit = (r: LeaveType) => { setForm({ ...r }); setEditing(r) }
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  const canSave = String(form.code ?? '').trim() && String(form.name ?? '').trim()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    const payload = {
      code: String(form.code).trim(),
      name: String(form.name).trim(),
      is_paid: !!form.is_paid,
      is_encashable: !!form.is_encashable,
      requires_proof: !!form.requires_proof,
      unit: form.unit ?? 'day',
      applies_to: form.applies_to ?? 'all',
      annual_quota: Number(form.annual_quota) || 0,
      carry_forward_cap: Number(form.carry_forward_cap) || 0,
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
        <p className="text-sm font-semibold text-brand-950">Leave Types</p>
        {canManage && <button onClick={openNew} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-[#F8FAFC]"><Sym name="add" size={14} /> Add Type</button>}
      </div>

      {isLoading ? (
        <div className="p-5 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-[#F8FAFC] rounded animate-pulse" />)}</div>
      ) : (
        <table className="w-full text-sm overflow-x-auto">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2.5 font-medium">Code</th>
              <th className="px-5 py-2.5 font-medium">Name</th>
              <th className="px-5 py-2.5 font-medium text-center">Quota</th>
              <th className="px-5 py-2.5 font-medium text-center">CF Cap</th>
              <th className="px-5 py-2.5 font-medium text-center">Paid</th>
              <th className="px-5 py-2.5 font-medium text-center">Encash</th>
              <th className="px-5 py-2.5 font-medium">Active</th>
              {canManage && <th className="px-5 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-5 py-2.5 font-mono text-brand-950">{r.code}</td>
                <td className="px-5 py-2.5 text-brand-950">{r.name}</td>
                <td className="px-5 py-2.5 text-center text-muted-foreground">{fmtDays(r.annual_quota)}</td>
                <td className="px-5 py-2.5 text-center text-muted-foreground">{fmtDays(r.carry_forward_cap)}</td>
                <td className="px-5 py-2.5 text-center text-muted-foreground">{r.is_paid ? 'Yes' : 'No'}</td>
                <td className="px-5 py-2.5 text-center text-muted-foreground">{r.is_encashable ? 'Yes' : 'No'}</td>
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
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-display font-semibold text-brand-950">{editing === 'new' ? 'Add Leave Type' : 'Edit Leave Type'}</h2>
              <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
            </div>
            <form onSubmit={submit} className="px-6 py-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-brand-950 mb-1">Code *</label><input className={ic} value={form.code ?? ''} onChange={e => set('code', e.target.value)} /></div>
                <div><label className="block text-xs font-medium text-brand-950 mb-1">Name *</label><input className={ic} value={form.name ?? ''} onChange={e => set('name', e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-brand-950 mb-1">Annual quota</label><input type="number" step="0.5" className={ic} value={form.annual_quota ?? 0} onChange={e => set('annual_quota', e.target.value)} /></div>
                <div><label className="block text-xs font-medium text-brand-950 mb-1">Carry-forward cap</label><input type="number" step="0.5" className={ic} value={form.carry_forward_cap ?? 0} onChange={e => set('carry_forward_cap', e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-brand-950 mb-1">Unit</label>
                  <select className={ic} value={form.unit ?? 'day'} onChange={e => set('unit', e.target.value)}>
                    <option value="day">Day</option>
                    <option value="half_day">Half day</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-brand-950 mb-1">Applies to</label>
                  <select className={ic} value={form.applies_to ?? 'all'} onChange={e => set('applies_to', e.target.value)}>
                    <option value="all">All</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <label className="flex items-center gap-2 text-sm text-brand-950"><input type="checkbox" checked={!!form.is_paid} onChange={e => set('is_paid', e.target.checked)} /> Paid</label>
                <label className="flex items-center gap-2 text-sm text-brand-950"><input type="checkbox" checked={!!form.is_encashable} onChange={e => set('is_encashable', e.target.checked)} /> Encashable</label>
                <label className="flex items-center gap-2 text-sm text-brand-950"><input type="checkbox" checked={!!form.requires_proof} onChange={e => set('requires_proof', e.target.checked)} /> Requires proof</label>
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

// ── Holidays ─────────────────────────────────────────────────────────────────────
function HolidaysSection({ canManage }: { canManage: boolean }) {
  const [year, setYear] = useState(istYear())
  const { data: rows = [], isLoading } = useHolidays(year)
  const upsert = useUpsertHoliday()
  const deactivate = useDeactivateHoliday()
  const [editing, setEditing] = useState<Holiday | 'new' | null>(null)
  const [form, setForm] = useState<Record<string, any>>({})

  const openNew = () => { setForm({ holiday_date: `${year}-01-01`, name: '', holiday_type: 'gazetted', calendar_year: year, is_active: true }); setEditing('new') }
  const openEdit = (r: Holiday) => { setForm({ ...r }); setEditing(r) }
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  const canSave = String(form.holiday_date ?? '').trim() && String(form.name ?? '').trim()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    const date = String(form.holiday_date)
    const payload = {
      holiday_date: date,
      name: String(form.name).trim(),
      holiday_type: form.holiday_type ?? 'gazetted',
      calendar_year: Number(date.slice(0, 4)) || year,
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
      <div className="flex items-center justify-between px-5 py-3 border-b border-border gap-3">
        <p className="text-sm font-semibold text-brand-950">Holiday Calendar</p>
        <div className="flex items-center gap-2">
          <input type="number" className="w-24 px-2 py-1.5 text-sm border border-border rounded-lg" value={year} onChange={e => setYear(Number(e.target.value) || year)} />
          {canManage && <button onClick={openNew} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-[#F8FAFC]"><Sym name="add" size={14} /> Add Holiday</button>}
        </div>
      </div>

      {isLoading ? (
        <div className="p-5 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-[#F8FAFC] rounded animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">No holidays for {year}.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2.5 font-medium">Date</th>
              <th className="px-5 py-2.5 font-medium">Name</th>
              <th className="px-5 py-2.5 font-medium">Type</th>
              <th className="px-5 py-2.5 font-medium">Active</th>
              {canManage && <th className="px-5 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-5 py-2.5 font-medium text-brand-950">{formatDate(r.holiday_date)}</td>
                <td className="px-5 py-2.5 text-brand-950">{r.name}</td>
                <td className="px-5 py-2.5 text-muted-foreground capitalize">{r.holiday_type}</td>
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
              <h2 className="font-display font-semibold text-brand-950">{editing === 'new' ? 'Add Holiday' : 'Edit Holiday'}</h2>
              <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
            </div>
            <form onSubmit={submit} className="px-6 py-5 space-y-4">
              <div><label className="block text-xs font-medium text-brand-950 mb-1">Date *</label><input type="date" className={ic} value={form.holiday_date ?? ''} onChange={e => set('holiday_date', e.target.value)} /></div>
              <div><label className="block text-xs font-medium text-brand-950 mb-1">Name *</label><input className={ic} value={form.name ?? ''} onChange={e => set('name', e.target.value)} /></div>
              <div>
                <label className="block text-xs font-medium text-brand-950 mb-1">Type</label>
                <select className={ic} value={form.holiday_type ?? 'gazetted'} onChange={e => set('holiday_type', e.target.value)}>
                  <option value="gazetted">Gazetted</option>
                  <option value="restricted">Restricted</option>
                  <option value="optional">Optional</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-brand-950"><input type="checkbox" checked={!!form.is_active} onChange={e => set('is_active', e.target.checked)} /> Active</label>
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

// ── Balance admin (manual ledger entries) ─────────────────────────────────────────
function BalanceAdminSection({ canManage }: { canManage: boolean }) {
  const { user } = useAuth()
  const year = istYear()
  const { data: employees = [] } = useEmployees()
  const { data: leaveTypes = [] } = useActiveLeaveTypes()

  const [employeeId, setEmployeeId] = useState('')
  const { data: balances = [] } = useLeaveBalances(employeeId || undefined, year)
  const post = usePostLedgerEntry(user?.id)

  const [leaveTypeId, setLeaveTypeId] = useState('')
  const [entryType, setEntryType] = useState<'opening' | 'accrual' | 'adjustment'>('opening')
  const [quantity, setQuantity] = useState('')
  const [entryDate, setEntryDate] = useState(istToday())
  const [note, setNote] = useState('')

  const canPost = canManage && employeeId && leaveTypeId && quantity !== '' && !Number.isNaN(Number(quantity))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canPost) return
    try {
      await post.mutateAsync({
        employee_id: employeeId,
        leave_type_id: leaveTypeId,
        entry_type: entryType,
        quantity: Number(quantity),
        entry_date: entryDate,
        ref_type: 'manual',
        note: note.trim() || null,
      })
      setQuantity(''); setNote('')
    } catch { /* toast surfaced by hook */ }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-brand-950 mb-4">Post Ledger Entry</h3>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Employee</label>
            <select className={ic} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
              <option value="">Select employee…</option>
              {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name || emp.employee_code || emp.id.slice(0, 8)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Leave type</label>
              <select className={ic} value={leaveTypeId} onChange={e => setLeaveTypeId(e.target.value)}>
                <option value="">Select…</option>
                {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.code}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Entry type</label>
              <select className={ic} value={entryType} onChange={e => setEntryType(e.target.value as any)}>
                <option value="opening">Opening</option>
                <option value="accrual">Accrual</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Quantity (± days)</label>
              <input type="number" step="0.5" className={ic} value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="e.g. 12 or -1" />
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Entry date</label>
              <input type="date" className={ic} value={entryDate} onChange={e => setEntryDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Note</label>
            <input className={ic} value={note} onChange={e => setNote(e.target.value)} />
          </div>
          <p className="text-[11px] text-muted-foreground">Credits are positive; debits negative. Automated accrual is deferred — these are manual adjustments.</p>
          <button type="submit" disabled={!canPost || post.isPending} className="w-full px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {post.isPending ? 'Posting…' : 'Post Entry'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-brand-950 mb-4">Current Balances {employeeId ? `· ${year}` : ''}</h3>
        {!employeeId ? (
          <p className="text-sm text-muted-foreground text-center py-8">Select an employee to see balances.</p>
        ) : balances.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No leave types.</p>
        ) : (
          <ul className="space-y-1.5">
            {balances.map(({ type, balance }) => (
              <li key={type.id} className="flex items-center justify-between text-sm border border-border rounded-lg px-3 py-2">
                <span className="text-brand-950 font-medium">{type.code}</span>
                <span className="text-muted-foreground">{type.name}</span>
                <span className="font-semibold text-brand-950">{fmtDays(balance)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Encashments ──────────────────────────────────────────────────────────────────
function EncashmentsSection({ canManage }: { canManage: boolean }) {
  const { user } = useAuth()
  const { data: rows = [], isLoading } = useEncashments()
  const { data: employees = [] } = useEmployees()
  const { data: leaveTypes = [] } = useActiveLeaveTypes()
  const decide = useDecideEncashment(user?.id)

  const empName = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of employees) m.set(e.id, e.name ?? e.employee_code ?? e.id.slice(0, 8))
    return m
  }, [employees])
  const typeCode = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of leaveTypes) m.set(t.id, t.code)
    return m
  }, [leaveTypes])

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <p className="text-sm font-semibold text-brand-950">Encashment Requests</p>
      </div>
      {isLoading ? (
        <div className="p-5 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-[#F8FAFC] rounded animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">No encashment requests.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2.5 font-medium">Employee</th>
              <th className="px-5 py-2.5 font-medium">Type</th>
              <th className="px-5 py-2.5 font-medium text-center">Days</th>
              <th className="px-5 py-2.5 font-medium">Requested</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
              {canManage && <th className="px-5 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-5 py-2.5 font-medium text-brand-950">{empName.get(r.employee_id) ?? r.employee_id.slice(0, 8)}</td>
                <td className="px-5 py-2.5 text-muted-foreground">{typeCode.get(r.leave_type_id) ?? '—'}</td>
                <td className="px-5 py-2.5 text-center text-muted-foreground">{fmtDays(r.days)}</td>
                <td className="px-5 py-2.5 text-muted-foreground">{formatDate(r.requested_on)}</td>
                <td className="px-5 py-2.5"><EncashmentStatusPill status={r.status} /></td>
                {canManage && (
                  <td className="px-5 py-2.5 text-right">
                    {r.status === 'requested' && (
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => decide.mutate({ id: r.id, approve: false })} disabled={decide.isPending} className="px-2.5 py-1 text-xs border border-border rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50">Reject</button>
                        <button onClick={() => decide.mutate({ id: r.id, approve: true })} disabled={decide.isPending} className="px-2.5 py-1 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">Approve</button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="px-5 py-3 text-[11px] text-muted-foreground border-t border-border">Amount is left blank on approval — Payroll computes the monetary value.</p>
    </div>
  )
}
