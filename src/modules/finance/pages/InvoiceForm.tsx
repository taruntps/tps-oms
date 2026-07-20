// Finance — create / edit DRAFT invoice modal.
// Line items are chosen from sales_services; rupee inputs are converted to paise
// (×100) on submit, and per-line CGST/SGST/IGST + invoice totals are previewed
// client-side via tax.ts (computeLine/computeTotals). Only DRAFT invoices are
// editable here; issued invoices are read-only.
import { useMemo, useState } from 'react'
import { Sym } from '@/components/shared/Sym'
import { formatRupees } from '@/lib/utils'
import { useClients, useServices, useProjects } from '../hooks/useLookups'
import { useCreateInvoice, useUpdateInvoice, useInvoiceLines } from '../hooks/useInvoices'
import type { InvoiceRow, InvoiceHeaderInput } from '../api/invoices'
import { computeLine, computeTotals, isIntraState, type LineInput } from '../api/tax'

interface Props {
  invoice?: InvoiceRow
  onClose: () => void
}

const ic =
  'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'

// A line as edited in the form — money entered in rupees, converted on submit.
interface LineDraft {
  service_id: string | null
  description: string
  quantity: string
  unit_price_rupees: string
  discount_percent: string
  gst_rate: string
  hsn_sac: string
}

const emptyLine: LineDraft = {
  service_id: null,
  description: '',
  quantity: '1',
  unit_price_rupees: '',
  discount_percent: '0',
  gst_rate: '18',
  hsn_sac: '',
}

function toLineInput(l: LineDraft): LineInput {
  return {
    service_id: l.service_id,
    description: l.description.trim(),
    quantity: Number(l.quantity) || 0,
    unit_price: Math.round((Number(l.unit_price_rupees) || 0) * 100),
    discount_percent: Number(l.discount_percent) || 0,
    gst_rate: Number(l.gst_rate) || 0,
    hsn_sac: l.hsn_sac.trim() || null,
  }
}

export function InvoiceForm({ invoice, onClose }: Props) {
  const isEdit = !!invoice
  const create = useCreateInvoice()
  const update = useUpdateInvoice()
  const { data: clients = [] } = useClients()
  const { data: services = [] } = useServices()
  const { data: projects = [] } = useProjects()
  const { data: existingLines = [] } = useInvoiceLines(isEdit ? invoice!.id : undefined)

  const today = new Date().toISOString().split('T')[0]

  const [header, setHeader] = useState({
    client_id: invoice?.client_id ?? '',
    project_id: invoice?.project_id ?? '',
    invoice_no: invoice?.invoice_no ?? '',
    invoice_date: invoice?.invoice_date ?? today,
    due_date: invoice?.due_date ?? '',
    place_of_supply: invoice?.place_of_supply ?? '',
    client_gstin: invoice?.client_gstin ?? '',
    billing_address: invoice?.billing_address ?? '',
    shipping_address: invoice?.shipping_address ?? '',
    contact_person: invoice?.contact_person ?? '',
    contact_email: invoice?.contact_email ?? '',
    contact_phone: invoice?.contact_phone ?? '',
    notes: invoice?.notes ?? '',
  })

  // Seed lines from the existing invoice once its lines load (edit mode).
  const [lines, setLines] = useState<LineDraft[]>([{ ...emptyLine }])
  const [seeded, setSeeded] = useState(!isEdit)
  if (isEdit && !seeded && existingLines.length > 0) {
    setLines(
      existingLines.map((l) => ({
        service_id: l.service_id,
        description: l.description,
        quantity: String(l.quantity),
        unit_price_rupees: String(l.unit_price / 100),
        discount_percent: String(l.discount_percent),
        gst_rate: String(l.gst_rate),
        hsn_sac: l.hsn_sac ?? '',
      })),
    )
    setSeeded(true)
  }

  const setH = (k: keyof typeof header, v: string) => setHeader((h) => ({ ...h, [k]: v }))
  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const addLine = () => setLines((ls) => [...ls, { ...emptyLine }])
  const removeLine = (i: number) => setLines((ls) => (ls.length === 1 ? ls : ls.filter((_, idx) => idx !== i)))

  const onPickClient = (clientId: string) => {
    const c = clients.find((x) => x.id === clientId)
    // Always pull the latest customer master values on select (user can override).
    const address = c ? [c.address, c.city, c.state].filter(Boolean).join(', ') : ''
    setHeader((h) => ({
      ...h,
      client_id: clientId,
      client_gstin: c?.gstin ?? h.client_gstin,
      place_of_supply: c?.state ?? h.place_of_supply,
      billing_address: address || h.billing_address,
      shipping_address: address || h.shipping_address,
      contact_person: c?.contact_person ?? h.contact_person,
      contact_email: c?.contact_email ?? h.contact_email,
      contact_phone: c?.contact_phone ?? h.contact_phone,
    }))
  }

  const onPickService = (i: number, serviceId: string) => {
    const s = services.find((x) => x.id === serviceId)
    if (!s) {
      setLine(i, { service_id: null })
      return
    }
    setLine(i, {
      service_id: s.id,
      description: s.name,
      unit_price_rupees: s.default_fee ? String(s.default_fee / 100) : '',
      gst_rate: String(s.gst_rate),
      hsn_sac: s.hsn_sac ?? '',
    })
  }

  const lineInputs = useMemo(() => lines.map(toLineInput), [lines])
  const totals = useMemo(
    () => computeTotals(lineInputs, header.place_of_supply),
    [lineInputs, header.place_of_supply],
  )
  const intra = isIntraState(header.place_of_supply)

  const submitting = create.isPending || update.isPending
  const validLines = lineInputs.filter((l) => l.description && l.quantity > 0)
  const canSubmit = !!header.client_id && validLines.length > 0 && !submitting

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    const headerInput: InvoiceHeaderInput = {
      invoice_no: header.invoice_no.trim() || null,
      client_id: header.client_id || null,
      project_id: header.project_id || null,
      invoice_date: header.invoice_date,
      due_date: header.due_date || null,
      place_of_supply: header.place_of_supply.trim() || null,
      client_gstin: header.client_gstin.trim() || null,
      billing_address: header.billing_address.trim() || null,
      shipping_address: header.shipping_address.trim() || null,
      contact_person: header.contact_person.trim() || null,
      contact_email: header.contact_email.trim() || null,
      contact_phone: header.contact_phone.trim() || null,
      notes: header.notes.trim() || null,
    }
    try {
      if (isEdit) await update.mutateAsync({ id: invoice!.id, header: headerInput, lines: validLines })
      else await create.mutateAsync({ header: headerInput, lines: validLines })
      onClose()
    } catch {
      // toast surfaced by the mutation hook
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">
            {isEdit ? 'Edit Draft Invoice' : 'New Draft Invoice'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <Sym name="close" size={16} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Header */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Client *">
              <select className={ic} value={header.client_id} onChange={(e) => onPickClient(e.target.value)}>
                <option value="">Select client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.trade_name || c.company_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Project">
              <select className={ic} value={header.project_id} onChange={(e) => setH('project_id', e.target.value)}>
                <option value="">None</option>
                {projects
                  .filter((p) => !header.client_id || p.client_id === header.client_id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.project_code}
                      {p.project_name ? ` — ${p.project_name}` : ''}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Invoice No (optional)">
              <input className={ic} value={header.invoice_no} onChange={(e) => setH('invoice_no', e.target.value)} placeholder="Assigned on issue" />
            </Field>
            <Field label="Invoice Date">
              <input type="date" className={ic} value={header.invoice_date} onChange={(e) => setH('invoice_date', e.target.value)} />
            </Field>
            <Field label="Due Date">
              <input type="date" className={ic} value={header.due_date} onChange={(e) => setH('due_date', e.target.value)} />
            </Field>
            <Field label="Place of Supply">
              <input className={ic} value={header.place_of_supply} onChange={(e) => setH('place_of_supply', e.target.value)} placeholder="e.g. Punjab" />
            </Field>
            <Field label="Client GSTIN" className="col-span-2">
              <input className={ic} value={header.client_gstin} onChange={(e) => setH('client_gstin', e.target.value)} placeholder="GSTIN" />
            </Field>
          </div>

          {/* Customer Details — auto-filled from client master; editable */}
          <div>
            <h3 className="text-xs font-semibold text-brand-950 uppercase tracking-wide mb-2">
              Customer Details <span className="normal-case font-normal text-muted-foreground">(auto-filled — override if needed)</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Billing Address">
                <textarea className={ic} rows={2} value={header.billing_address} onChange={(e) => setH('billing_address', e.target.value)} placeholder="Billing address" />
              </Field>
              <Field label="Shipping Address">
                <textarea className={ic} rows={2} value={header.shipping_address} onChange={(e) => setH('shipping_address', e.target.value)} placeholder="Shipping address" />
              </Field>
              <Field label="Contact Person">
                <input className={ic} value={header.contact_person} onChange={(e) => setH('contact_person', e.target.value)} placeholder="Name" />
              </Field>
              <Field label="Contact Phone">
                <input className={ic} value={header.contact_phone} onChange={(e) => setH('contact_phone', e.target.value)} placeholder="Phone" />
              </Field>
              <Field label="Contact Email" className="md:col-span-2">
                <input className={ic} type="email" value={header.contact_email} onChange={(e) => setH('contact_email', e.target.value)} placeholder="email@example.com" />
              </Field>
            </div>
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-brand-950 uppercase tracking-wide">Line Items</h3>
              <span className="text-[11px] text-muted-foreground">
                {intra ? 'Intra-state — CGST + SGST' : 'Inter-state — IGST'}
              </span>
            </div>
            <div className="border border-border rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F8FAFC] text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Service / Description</th>
                    <th className="px-2 py-2 text-right font-semibold w-16">Qty</th>
                    <th className="px-2 py-2 text-right font-semibold w-28">Rate (₹)</th>
                    <th className="px-2 py-2 text-right font-semibold w-16">Disc %</th>
                    <th className="px-2 py-2 text-right font-semibold w-16">GST %</th>
                    <th className="px-2 py-2 text-right font-semibold w-28">Line Total</th>
                    <th className="px-2 py-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((l, i) => {
                    const c = computeLine(toLineInput(l), header.place_of_supply)
                    return (
                      <tr key={i} className="align-top">
                        <td className="px-3 py-2">
                          <select
                            className={`${ic} mb-1`}
                            value={l.service_id ?? ''}
                            onChange={(e) => onPickService(i, e.target.value)}
                          >
                            <option value="">Custom / choose service…</option>
                            {services.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                          <input
                            className={ic}
                            value={l.description}
                            onChange={(e) => setLine(i, { description: e.target.value })}
                            placeholder="Description"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input className={`${ic} text-right`} type="number" min={0} step="1" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                        </td>
                        <td className="px-2 py-2">
                          <input className={`${ic} text-right`} type="number" min={0} step="0.01" value={l.unit_price_rupees} onChange={(e) => setLine(i, { unit_price_rupees: e.target.value })} />
                        </td>
                        <td className="px-2 py-2">
                          <input className={`${ic} text-right`} type="number" min={0} max={100} step="0.01" value={l.discount_percent} onChange={(e) => setLine(i, { discount_percent: e.target.value })} />
                        </td>
                        <td className="px-2 py-2">
                          <input className={`${ic} text-right`} type="number" min={0} step="0.01" value={l.gst_rate} onChange={(e) => setLine(i, { gst_rate: e.target.value })} />
                        </td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          <p className="font-medium text-brand-950">{formatRupees(c.line_total)}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {intra ? `C ${formatRupees(c.cgst)} · S ${formatRupees(c.sgst)}` : `IGST ${formatRupees(c.igst)}`}
                          </p>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button type="button" onClick={() => removeLine(i)} className="text-muted-foreground hover:text-red-600" title="Remove line">
                            <Sym name="delete" size={15} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={addLine} className="mt-2 flex items-center gap-1.5 text-sm text-brand-700 hover:text-brand-800">
              <Sym name="add" size={15} /> Add line
            </button>
          </div>

          {/* Totals + notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Notes">
              <textarea className={ic} rows={3} value={header.notes} onChange={(e) => setH('notes', e.target.value)} placeholder="Payment terms, remarks…" />
            </Field>
            <div className="bg-[#F8FAFC] border border-border rounded-xl p-4 text-sm space-y-1.5">
              <Row label="Subtotal" value={formatRupees(totals.subtotal)} />
              <Row label="Discount" value={`− ${formatRupees(totals.discount_total)}`} />
              <Row label="Tax" value={formatRupees(totals.tax_total)} />
              <div className="border-t border-border pt-1.5 mt-1.5">
                <Row label="Grand Total" value={formatRupees(totals.grand_total)} strong />
              </div>
            </div>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">
            Cancel
          </button>
          <button onClick={onSubmit} disabled={!canSubmit} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {submitting ? 'Saving…' : isEdit ? 'Update Draft' : 'Create Draft'}
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

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? 'font-semibold text-brand-950' : 'text-muted-foreground'}>{label}</span>
      <span className={strong ? 'font-semibold text-brand-950' : 'text-brand-950'}>{value}</span>
    </div>
  )
}
