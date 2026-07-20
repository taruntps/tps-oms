// Finance — invoice detail (/finance/invoices/:id).
// Header + line items + linked payments. Record a payment (gated
// finance.payment.record) which updates the invoice's amount_paid/status, and
// create a credit note (gated finance.creditnote.manage). Provider artifacts
// (IRN / QR / PDF) are shown read-only once the billing worker has synced them.
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { toast } from '@/components/shared/Toast'
import { formatDate, formatRupees } from '@/lib/utils'
import { useCan } from '@/core/access/useCan'
import { useInvoice, useInvoiceLines, useCreditNotes, useCreateCreditNote } from '../hooks/useInvoices'
import { useInvoicePayments, useRecordInvoicePayment } from '../hooks/usePayments'
import { useProjects } from '../hooks/useLookups'
import { PAYMENT_MODES, type PaymentInput } from '../api/payments'
import type { InvoiceRow } from '../api/invoices'
import { StatusPill } from './InvoicesPage'

const ic =
  'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: invoice, isLoading, error } = useInvoice(id)
  const { data: lines = [] } = useInvoiceLines(id)
  const { data: payments = [] } = useInvoicePayments(id)
  const { data: creditNotes = [] } = useCreditNotes(id)

  const canRecordPayment = useCan('finance.payment.record')
  const canManageCn = useCan('finance.creditnote.manage')

  const [showPayment, setShowPayment] = useState(false)
  const [showCn, setShowCn] = useState(false)

  if (isLoading) {
    return (
      <div>
        <TopBar title="Invoice" />
        <div className="p-6"><div className="h-40 bg-white rounded-xl border border-border animate-pulse" /></div>
      </div>
    )
  }
  if (error || !invoice) {
    return (
      <div>
        <TopBar title="Invoice" />
        <div className="p-6 text-sm text-red-600">{error ? (error as Error).message : 'Invoice not found.'}</div>
      </div>
    )
  }

  const balance = Math.max(0, invoice.grand_total - invoice.amount_paid)
  const clientLabel = invoice.client?.trade_name || invoice.client?.company_name || '—'

  return (
    <div>
      <TopBar title={invoice.invoice_no || 'Draft Invoice'} subtitle={clientLabel} />

      <div className="p-6 space-y-5 animate-fade-up">
        <button onClick={() => navigate('/finance/invoices')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-brand-700">
          <Sym name="arrow_back" size={15} /> Back to invoices
        </button>

        {/* Header card */}
        <div className="bg-white rounded-xl border border-border p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="font-display font-semibold text-brand-950 text-lg">{invoice.invoice_no || 'Draft'}</h2>
                <StatusPill status={invoice.status} />
              </div>
              <p className="text-sm text-muted-foreground">{clientLabel}</p>
              {invoice.client_gstin && <p className="text-xs text-muted-foreground font-mono">GSTIN {invoice.client_gstin}</p>}
            </div>
            <div className="flex items-center gap-2">
              {invoice.pdf_url && (
                <a href={invoice.pdf_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-brand-700 border border-border rounded-lg px-3 py-1.5 hover:bg-[#F8FAFC]">
                  <Sym name="picture_as_pdf" size={15} /> Open PDF
                </a>
              )}
              {canManageCn && (
                <button onClick={() => setShowCn(true)} className="inline-flex items-center gap-1.5 text-sm border border-border rounded-lg px-3 py-1.5 hover:bg-[#F8FAFC]">
                  <Sym name="receipt" size={15} /> Credit Note
                </button>
              )}
              {canRecordPayment && invoice.status !== 'cancelled' && (
                <button onClick={() => setShowPayment(true)} className="inline-flex items-center gap-1.5 text-sm text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3 py-1.5">
                  <Sym name="add" size={15} /> Record Payment
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-5 border-t border-border text-sm">
            <Meta label="Invoice Date" value={formatDate(invoice.invoice_date)} />
            <Meta label="Due Date" value={formatDate(invoice.due_date)} />
            <Meta label="Place of Supply" value={invoice.place_of_supply || '—'} />
            <Meta label="Grand Total" value={formatRupees(invoice.grand_total)} />
            <Meta label="Amount Paid" value={formatRupees(invoice.amount_paid)} accent="text-emerald-700" />
            <Meta label="Balance" value={formatRupees(balance)} accent="text-amber-700" />
          </div>

          {/* Provider artifacts — read-only, populated by the billing worker */}
          {(invoice.irn || invoice.qr_code || invoice.provider_id) && (
            <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground space-y-1">
              {invoice.provider && <p>Provider: <span className="text-brand-950">{invoice.provider}</span> {invoice.provider_id && <span className="font-mono">#{invoice.provider_id}</span>}</p>}
              {invoice.irn && <p className="font-mono break-all">IRN: {invoice.irn}</p>}
              {invoice.qr_code && <p className="font-mono break-all">QR: {invoice.qr_code}</p>}
            </div>
          )}
        </div>

        {/* Lines */}
        <div className="bg-white rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F8FAFC] border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Description</th>
                <th className="px-3 py-3 text-right font-semibold">Qty</th>
                <th className="px-3 py-3 text-right font-semibold">Rate</th>
                <th className="px-3 py-3 text-right font-semibold">GST</th>
                <th className="px-3 py-3 text-right font-semibold">CGST</th>
                <th className="px-3 py-3 text-right font-semibold">SGST</th>
                <th className="px-3 py-3 text-right font-semibold">IGST</th>
                <th className="px-3 py-3 text-right font-semibold">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3">
                    <p className="text-brand-950">{l.description}</p>
                    {l.hsn_sac && <p className="text-[10px] text-muted-foreground font-mono">HSN/SAC {l.hsn_sac}</p>}
                  </td>
                  <td className="px-3 py-3 text-right text-muted-foreground">{l.quantity}</td>
                  <td className="px-3 py-3 text-right text-muted-foreground">{formatRupees(l.unit_price)}</td>
                  <td className="px-3 py-3 text-right text-muted-foreground">{l.gst_rate}%</td>
                  <td className="px-3 py-3 text-right text-muted-foreground">{formatRupees(l.cgst)}</td>
                  <td className="px-3 py-3 text-right text-muted-foreground">{formatRupees(l.sgst)}</td>
                  <td className="px-3 py-3 text-right text-muted-foreground">{formatRupees(l.igst)}</td>
                  <td className="px-3 py-3 text-right font-medium text-brand-950">{formatRupees(l.line_total)}</td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">No line items.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Payments */}
        <Section title="Linked Payments">
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-6 text-center">No payments recorded.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Mode</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Reference</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5 text-muted-foreground">{formatDate(p.payment_date)}</td>
                    <td className="px-4 py-2.5 text-brand-950">{p.payment_mode}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.reference_no || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-emerald-700">{formatRupees(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Credit notes */}
        {creditNotes.length > 0 && (
          <Section title="Credit Notes">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">No</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Reason</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {creditNotes.map((cn) => (
                  <tr key={cn.id}>
                    <td className="px-4 py-2.5 text-brand-950">{cn.credit_note_no || 'Draft'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{formatDate(cn.cn_date)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{cn.reason || '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground capitalize">{cn.status}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-brand-950">{formatRupees(cn.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}
      </div>

      {showPayment && <RecordPaymentModal invoice={invoice} onClose={() => setShowPayment(false)} />}
      {showCn && <CreditNoteModal invoice={invoice} onClose={() => setShowCn(false)} />}
    </div>
  )
}

function Meta({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-brand-950 ${accent ?? ''}`}>{value}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-brand-950 uppercase tracking-wide mb-2">{title}</h3>
      <div className="bg-white rounded-xl border border-border overflow-x-auto">{children}</div>
    </div>
  )
}

// ── Record payment modal ──
function RecordPaymentModal({ invoice, onClose }: { invoice: InvoiceRow; onClose: () => void }) {
  const record = useRecordInvoicePayment()
  const { data: projects = [] } = useProjects()
  const balance = Math.max(0, invoice.grand_total - invoice.amount_paid)

  const [form, setForm] = useState({
    amount_rupees: balance ? String(balance / 100) : '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_mode: 'NEFT',
    project_id: invoice.project_id ?? '',
    reference_no: '',
    notes: '',
  })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invoice.client_id) {
      toast.error('Invoice has no client', 'Cannot record a payment without a client on the invoice.')
      return
    }
    if (!form.project_id) {
      toast.error('Project required', 'Pick the project this payment belongs to.')
      return
    }
    const amount = Math.round((Number(form.amount_rupees) || 0) * 100)
    if (amount <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    const input: PaymentInput = {
      client_id: invoice.client_id,
      project_id: form.project_id,
      invoice_id: invoice.id,
      amount,
      payment_date: form.payment_date,
      payment_mode: form.payment_mode,
      reference_no: form.reference_no.trim() || null,
      notes: form.notes.trim() || null,
    }
    try {
      await record.mutateAsync({ invoice, input })
      onClose()
    } catch {
      // toast surfaced by the hook
    }
  }

  return (
    <ModalShell title="Record Payment" onClose={onClose}>
      <form onSubmit={onSubmit} className="px-6 py-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount (₹) *">
            <input className={ic} type="number" min={0} step="0.01" value={form.amount_rupees} onChange={(e) => set('amount_rupees', e.target.value)} autoFocus />
          </Field>
          <Field label="Date *">
            <input className={ic} type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} />
          </Field>
          <Field label="Mode *">
            <select className={ic} value={form.payment_mode} onChange={(e) => set('payment_mode', e.target.value)}>
              {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Project *">
            <select className={ic} value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
              <option value="">Select project…</option>
              {projects
                .filter((p) => !invoice.client_id || p.client_id === invoice.client_id)
                .map((p) => <option key={p.id} value={p.id}>{p.project_code}{p.project_name ? ` — ${p.project_name}` : ''}</option>)}
            </select>
          </Field>
          <Field label="Reference No" className="col-span-2">
            <input className={ic} value={form.reference_no} onChange={(e) => set('reference_no', e.target.value)} placeholder="UTR / cheque no" />
          </Field>
          <Field label="Notes" className="col-span-2">
            <textarea className={ic} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">Outstanding balance: <span className="font-medium text-brand-950">{formatRupees(balance)}</span></p>
      </form>
      <ModalFooter onClose={onClose} onSubmit={onSubmit} pending={record.isPending} label="Record Payment" />
    </ModalShell>
  )
}

// ── Credit note modal ──
function CreditNoteModal({ invoice, onClose }: { invoice: InvoiceRow; onClose: () => void }) {
  const create = useCreateCreditNote()
  const [form, setForm] = useState({ amount_rupees: '', reason: '' })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amount = Math.round((Number(form.amount_rupees) || 0) * 100)
    if (amount <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    try {
      await create.mutateAsync({
        invoice_id: invoice.id,
        client_id: invoice.client_id,
        amount,
        reason: form.reason.trim() || null,
      })
      onClose()
    } catch {
      // toast surfaced by the hook
    }
  }

  return (
    <ModalShell title="Create Credit Note" onClose={onClose}>
      <form onSubmit={onSubmit} className="px-6 py-5 space-y-4">
        <Field label="Amount (₹) *">
          <input className={ic} type="number" min={0} step="0.01" value={form.amount_rupees} onChange={(e) => set('amount_rupees', e.target.value)} autoFocus />
        </Field>
        <Field label="Reason">
          <textarea className={ic} rows={3} value={form.reason} onChange={(e) => set('reason', e.target.value)} placeholder="Reason for the credit note" />
        </Field>
        <p className="text-xs text-muted-foreground">The credit note is created as a draft; the billing provider assigns its number on issue.</p>
      </form>
      <ModalFooter onClose={onClose} onSubmit={onSubmit} pending={create.isPending} label="Create Credit Note" />
    </ModalShell>
  )
}

// ── Small modal primitives ──
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}

function ModalFooter({ onClose, onSubmit, pending, label }: { onClose: () => void; onSubmit: (e: React.FormEvent) => void; pending: boolean; label: string }) {
  return (
    <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
      <button onClick={onClose} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
      <button onClick={onSubmit} disabled={pending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
        {pending ? 'Saving…' : label}
      </button>
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
