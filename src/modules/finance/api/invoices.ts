// Finance — invoice data access (finance_invoices, finance_invoice_lines,
// finance_credit_notes). None of these are in the generated Database types yet,
// so we cast the client to `any` (established pattern; see administration/api).
import { supabase } from '@/lib/supabase'
import { computeLine, computeTotals, type LineInput } from './tax'

const db = supabase as any

export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'cancelled'

export interface InvoiceRow {
  id: string
  invoice_no: string | null
  org_id: string | null
  client_id: string | null
  deal_id: string | null
  order_id: string | null
  project_id: string | null
  status: InvoiceStatus
  invoice_date: string
  due_date: string | null
  place_of_supply: string | null
  client_gstin: string | null
  billing_address: string | null
  shipping_address: string | null
  contact_person: string | null
  contact_email: string | null
  contact_phone: string | null
  subtotal: number
  discount_total: number
  tax_total: number
  grand_total: number
  amount_paid: number
  notes: string | null
  irn: string | null
  qr_code: string | null
  pdf_url: string | null
  provider: string | null
  provider_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Embedded lookups (from the joined select)
  client?: { company_name: string | null; trade_name: string | null } | null
}

export interface InvoiceLineRow {
  id: string
  invoice_id: string
  service_id: string | null
  description: string
  quantity: number
  unit_price: number
  discount_percent: number
  gst_rate: number
  hsn_sac: string | null
  cgst: number
  sgst: number
  igst: number
  line_total: number
}

export interface CreditNoteRow {
  id: string
  credit_note_no: string | null
  invoice_id: string | null
  client_id: string | null
  status: 'draft' | 'issued' | 'cancelled'
  reason: string | null
  amount: number
  cn_date: string
  provider: string | null
  provider_id: string | null
  created_by: string | null
  created_at: string
}

const CLIENT_JOIN = 'client:clients(company_name, trade_name)'

export async function fetchInvoices(status?: InvoiceStatus | 'all'): Promise<InvoiceRow[]> {
  let q = db
    .from('finance_invoices')
    .select(`*, ${CLIENT_JOIN}`)
    .order('created_at', { ascending: false })
  if (status && status !== 'all') q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as InvoiceRow[]
}

export async function fetchInvoice(id: string): Promise<InvoiceRow> {
  const { data, error } = await db
    .from('finance_invoices')
    .select(`*, ${CLIENT_JOIN}`)
    .eq('id', id)
    .single()
  if (error) throw error
  return data as InvoiceRow
}

export async function fetchInvoiceLines(invoiceId: string): Promise<InvoiceLineRow[]> {
  const { data, error } = await db
    .from('finance_invoice_lines')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('id', { ascending: true })
  if (error) throw error
  return (data ?? []) as InvoiceLineRow[]
}

export interface InvoiceHeaderInput {
  invoice_no: string | null
  client_id: string | null
  project_id: string | null
  invoice_date: string
  due_date: string | null
  place_of_supply: string | null
  client_gstin: string | null
  billing_address: string | null
  shipping_address: string | null
  contact_person: string | null
  contact_email: string | null
  contact_phone: string | null
  notes: string | null
}

/** Persist the line rows (with computed tax) for an invoice. */
function toLineRows(invoiceId: string, lines: LineInput[], placeOfSupply: string | null) {
  return lines.map((l) => {
    const c = computeLine(l, placeOfSupply)
    return {
      invoice_id: invoiceId,
      service_id: l.service_id,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      discount_percent: l.discount_percent,
      gst_rate: l.gst_rate,
      hsn_sac: l.hsn_sac,
      cgst: c.cgst,
      sgst: c.sgst,
      igst: c.igst,
      line_total: c.line_total,
    }
  })
}

/** Create a DRAFT invoice with its line items. Totals computed client-side. */
export async function createInvoice(
  header: InvoiceHeaderInput,
  lines: LineInput[],
  createdBy: string | null,
): Promise<string> {
  const totals = computeTotals(lines, header.place_of_supply)
  const { data, error } = await db
    .from('finance_invoices')
    .insert({
      ...header,
      status: 'draft',
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      tax_total: totals.tax_total,
      grand_total: totals.grand_total,
      amount_paid: 0,
      created_by: createdBy,
    })
    .select('id')
    .single()
  if (error) throw error
  const invoiceId = data.id as string

  if (lines.length) {
    const { error: lineErr } = await db
      .from('finance_invoice_lines')
      .insert(toLineRows(invoiceId, lines, header.place_of_supply))
    if (lineErr) throw lineErr
  }
  return invoiceId
}

/** Replace a draft invoice's header + lines and recompute totals. */
export async function updateDraftInvoice(
  id: string,
  header: InvoiceHeaderInput,
  lines: LineInput[],
): Promise<void> {
  const totals = computeTotals(lines, header.place_of_supply)
  const { error } = await db
    .from('finance_invoices')
    .update({
      ...header,
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      tax_total: totals.tax_total,
      grand_total: totals.grand_total,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error

  const { error: delErr } = await db.from('finance_invoice_lines').delete().eq('invoice_id', id)
  if (delErr) throw delErr
  if (lines.length) {
    const { error: lineErr } = await db
      .from('finance_invoice_lines')
      .insert(toLineRows(id, lines, header.place_of_supply))
    if (lineErr) throw lineErr
  }
}

/**
 * Mark a draft invoice as issued (ERP-side status transition). Provider fields
 * (provider_id/irn/qr_code/pdf_url) are populated later by the billing worker.
 */
export async function markInvoiceIssued(id: string): Promise<void> {
  // Guard the draft→issued transition atomically: the `.eq('status','draft')`
  // filter means a concurrent issue (or a non-draft invoice) matches no row, so
  // `maybeSingle()` returns null and we abort BEFORE the caller enqueues a
  // provider op. This closes the double-issue race (review finding #1).
  const { data, error } = await db
    .from('finance_invoices')
    .update({ status: 'issued', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Invoice is not a draft (already issued?)')
}

export async function cancelInvoice(id: string): Promise<void> {
  // Only an ISSUED invoice may be cancelled via this path. paid/cancelled/draft
  // match no row → maybeSingle() returns null and we throw (review finding #5).
  const { data, error } = await db
    .from('finance_invoices')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'issued')
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Only issued invoices can be cancelled')
}

// ── Credit notes ──
export async function fetchCreditNotes(invoiceId: string): Promise<CreditNoteRow[]> {
  const { data, error } = await db
    .from('finance_credit_notes')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as CreditNoteRow[]
}

export async function createCreditNote(
  input: { invoice_id: string; client_id: string | null; amount: number; reason: string | null },
  createdBy: string | null,
): Promise<void> {
  const { error } = await db.from('finance_credit_notes').insert({
    invoice_id: input.invoice_id,
    client_id: input.client_id,
    amount: input.amount,
    reason: input.reason,
    status: 'draft',
    created_by: createdBy,
  })
  if (error) throw error
}
