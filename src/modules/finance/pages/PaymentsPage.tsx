// Finance — payments list (/finance/payments).
// Lists existing payments (client, amount, linked invoice_no) and records a
// standalone payment (gated finance.payment.record).
import { useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { toast } from '@/components/shared/Toast'
import { formatDate, formatRupees } from '@/lib/utils'
import { useCan } from '@/core/access/useCan'
import { usePayments, useRecordStandalonePayment } from '../hooks/usePayments'
import { useClients, useProjects } from '../hooks/useLookups'
import { PAYMENT_MODES, type PaymentRow, type PaymentInput } from '../api/payments'

const ic =
  'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'

function clientName(p: PaymentRow): string {
  return p.client?.trade_name || p.client?.company_name || '—'
}

export default function PaymentsPage() {
  const canRecord = useCan('finance.payment.record')
  const { data: payments = [], isLoading, error } = usePayments()
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return payments
    return payments.filter(
      (p) =>
        clientName(p).toLowerCase().includes(q) ||
        (p.invoice?.invoice_no ?? '').toLowerCase().includes(q) ||
        (p.reference_no ?? '').toLowerCase().includes(q),
    )
  }, [payments, search])

  return (
    <div>
      <TopBar title="Payments" subtitle={`${payments.length} payment${payments.length === 1 ? '' : 's'}`} />

      <div className="p-6 animate-fade-up">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Sym name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client, invoice, reference…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
            />
          </div>
          {canRecord && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors ml-auto"
            >
              <Sym name="add" size={16} />
              Record Payment
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
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Client</th>
                  <th className="px-4 py-3 text-left font-semibold">Mode</th>
                  <th className="px-4 py-3 text-left font-semibold">Invoice</th>
                  <th className="px-4 py-3 text-left font-semibold">Reference</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-[#F8FAFC]">
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(p.payment_date)}</td>
                    <td className="px-4 py-3 text-brand-950">{clientName(p)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.payment_mode}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.invoice?.invoice_no || p.invoice_no || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.reference_no || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-700">{formatRupees(p.amount)}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No payments found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && <StandalonePaymentModal onClose={() => setShowForm(false)} />}
    </div>
  )
}

function StandalonePaymentModal({ onClose }: { onClose: () => void }) {
  const record = useRecordStandalonePayment()
  const { data: clients = [] } = useClients()
  const { data: projects = [] } = useProjects()

  const [form, setForm] = useState({
    client_id: '',
    project_id: '',
    amount_rupees: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_mode: 'NEFT',
    reference_no: '',
    notes: '',
  })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.client_id) { toast.error('Select a client'); return }
    if (!form.project_id) { toast.error('Select a project'); return }
    const amount = Math.round((Number(form.amount_rupees) || 0) * 100)
    if (amount <= 0) { toast.error('Enter a valid amount'); return }
    const input: PaymentInput = {
      client_id: form.client_id,
      project_id: form.project_id,
      invoice_id: null,
      amount,
      payment_date: form.payment_date,
      payment_mode: form.payment_mode,
      reference_no: form.reference_no.trim() || null,
      notes: form.notes.trim() || null,
    }
    try {
      await record.mutateAsync(input)
      onClose()
    } catch {
      // toast surfaced by the hook
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">Record Payment</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>
        <form onSubmit={onSubmit} className="overflow-y-auto flex-1 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Client *" className="col-span-2">
              <select className={ic} value={form.client_id} onChange={(e) => set('client_id', e.target.value)}>
                <option value="">Select client…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.trade_name || c.company_name}</option>)}
              </select>
            </Field>
            <Field label="Project *" className="col-span-2">
              <select className={ic} value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
                <option value="">Select project…</option>
                {projects
                  .filter((p) => !form.client_id || p.client_id === form.client_id)
                  .map((p) => <option key={p.id} value={p.id}>{p.project_code}{p.project_name ? ` — ${p.project_name}` : ''}</option>)}
              </select>
            </Field>
            <Field label="Amount (₹) *">
              <input className={ic} type="number" min={0} step="0.01" value={form.amount_rupees} onChange={(e) => set('amount_rupees', e.target.value)} />
            </Field>
            <Field label="Date *">
              <input className={ic} type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} />
            </Field>
            <Field label="Mode *">
              <select className={ic} value={form.payment_mode} onChange={(e) => set('payment_mode', e.target.value)}>
                {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Reference No">
              <input className={ic} value={form.reference_no} onChange={(e) => set('reference_no', e.target.value)} placeholder="UTR / cheque no" />
            </Field>
            <Field label="Notes" className="col-span-2">
              <textarea className={ic} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </Field>
          </div>
        </form>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={onSubmit} disabled={record.isPending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {record.isPending ? 'Saving…' : 'Record Payment'}
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
