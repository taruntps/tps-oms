// Finance — government (pass-through) fees (/finance/govt-fees).
// List and manage finance_govt_fees (authority, amount, paid_by, status, project
// link). Create/edit gated to finance.govtfee.manage.
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { toast } from '@/components/shared/Toast'
import { formatDate, formatRupees, cn } from '@/lib/utils'
import { useCan } from '@/core/access/useCan'
import { useGovtFees, useCreateGovtFee, useUpdateGovtFee } from '../hooks/useGovtFees'
import { useProjects } from '../hooks/useLookups'
import type { GovtFeeRow, GovtFeeInput, GovtFeePaidBy, GovtFeeStatus } from '../api/govtFees'

const ic =
  'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'

const STATUS_BADGE: Record<GovtFeeStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  paid: 'bg-blue-50 text-blue-700 border-blue-200',
  recovered: 'bg-green-50 text-green-700 border-green-200',
}

const AUTHORITIES = ['FSSAI', 'Lab', 'Other']

function projectLabel(f: GovtFeeRow): string {
  if (!f.project) return '—'
  return f.project.project_code || f.project.project_name || '—'
}

export default function GovtFeesPage() {
  const canManage = useCan('finance.govtfee.manage')
  const { data: fees = [], isLoading, error } = useGovtFees()
  const [editing, setEditing] = useState<GovtFeeRow | null>(null)
  const [showForm, setShowForm] = useState(false)

  const pendingTotal = useMemo(
    () => fees.filter((f) => f.status === 'pending').reduce((s, f) => s + f.amount, 0),
    [fees],
  )

  const openNew = () => { setEditing(null); setShowForm(true) }
  const openEdit = (f: GovtFeeRow) => { setEditing(f); setShowForm(true) }

  return (
    <div>
      <TopBar title="Government Fees" subtitle={`${fees.length} record${fees.length === 1 ? '' : 's'} · ${formatRupees(pendingTotal)} pending`} />

      <div className="p-6 animate-fade-up">
        <div className="flex items-center justify-end mb-5">
          {canManage && (
            <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors">
              <Sym name="add" size={16} />
              New Fee
            </button>
          )}
        </div>

        {error ? (
          <div className="bg-white rounded-xl border border-border p-4 text-sm text-red-600">{(error as Error).message}</div>
        ) : isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-white rounded-xl border border-border animate-pulse" />)}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Authority</th>
                  <th className="px-4 py-3 text-left font-semibold">Project</th>
                  <th className="px-4 py-3 text-left font-semibold">Paid By</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Reference</th>
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  {canManage && <th className="px-4 py-3 text-right font-semibold">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {fees.map((f) => (
                  <tr key={f.id} className="hover:bg-[#F8FAFC]">
                    <td className="px-4 py-3 text-brand-950">{f.authority}</td>
                    <td className="px-4 py-3 text-muted-foreground">{projectLabel(f)}</td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">{f.paid_by}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-block text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize', STATUS_BADGE[f.status])}>{f.status}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{f.reference_no || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(f.created_at)}</td>
                    <td className="px-4 py-3 text-right font-medium text-brand-950">{formatRupees(f.amount)}</td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEdit(f)} className="text-muted-foreground hover:text-brand-700" title="Edit"><Sym name="edit" size={15} /></button>
                      </td>
                    )}
                  </tr>
                ))}
                {fees.length === 0 && (
                  <tr><td colSpan={canManage ? 8 : 7} className="px-4 py-10 text-center text-sm text-muted-foreground">No government fees recorded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && <GovtFeeModal fee={editing} onClose={() => setShowForm(false)} />}
    </div>
  )
}

function GovtFeeModal({ fee, onClose }: { fee: GovtFeeRow | null; onClose: () => void }) {
  const isEdit = !!fee
  const create = useCreateGovtFee()
  const update = useUpdateGovtFee()
  const { data: projects = [] } = useProjects()

  const [form, setForm] = useState({
    authority: fee?.authority ?? 'FSSAI',
    project_id: fee?.project_id ?? '',
    amount_rupees: fee ? String(fee.amount / 100) : '',
    paid_by: (fee?.paid_by ?? 'client') as GovtFeePaidBy,
    status: (fee?.status ?? 'pending') as GovtFeeStatus,
    reference_no: fee?.reference_no ?? '',
    notes: fee?.notes ?? '',
  })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submitting = create.isPending || update.isPending

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amount = Math.round((Number(form.amount_rupees) || 0) * 100)
    if (amount <= 0) { toast.error('Enter a valid amount'); return }
    const input: GovtFeeInput = {
      project_id: form.project_id || null,
      authority: form.authority,
      amount,
      paid_by: form.paid_by,
      status: form.status,
      reference_no: form.reference_no.trim() || null,
      notes: form.notes.trim() || null,
    }
    try {
      if (isEdit) await update.mutateAsync({ id: fee!.id, input })
      else await create.mutateAsync(input)
      onClose()
    } catch {
      // toast surfaced by the hook
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">{isEdit ? 'Edit Government Fee' : 'New Government Fee'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>
        <form onSubmit={onSubmit} className="overflow-y-auto flex-1 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Authority *">
              <select className={ic} value={form.authority} onChange={(e) => set('authority', e.target.value)}>
                {AUTHORITIES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="Amount (₹) *">
              <input className={ic} type="number" min={0} step="0.01" value={form.amount_rupees} onChange={(e) => set('amount_rupees', e.target.value)} />
            </Field>
            <Field label="Project" className="col-span-2">
              <select className={ic} value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
                <option value="">None</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.project_code}{p.project_name ? ` — ${p.project_name}` : ''}</option>)}
              </select>
            </Field>
            <Field label="Paid By *">
              <select className={ic} value={form.paid_by} onChange={(e) => set('paid_by', e.target.value)}>
                <option value="client">Client</option>
                <option value="tps">TPS</option>
              </select>
            </Field>
            <Field label="Status *">
              <select className={ic} value={form.status} onChange={(e) => set('status', e.target.value)}>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="recovered">Recovered</option>
              </select>
            </Field>
            <Field label="Reference No" className="col-span-2">
              <input className={ic} value={form.reference_no} onChange={(e) => set('reference_no', e.target.value)} placeholder="Challan / receipt no" />
            </Field>
            <Field label="Notes" className="col-span-2">
              <textarea className={ic} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </Field>
          </div>
        </form>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={onSubmit} disabled={submitting} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {submitting ? 'Saving…' : isEdit ? 'Update Fee' : 'Create Fee'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-brand-950 mb-1">{label}</label>
      {children}
    </div>
  )
}
