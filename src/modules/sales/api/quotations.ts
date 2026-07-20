// Sales — Quotations, orders and handoff data access (thin supabase wrappers).
// Tables: sales_quotations, sales_quotation_lines, sales_orders, sales_handoff_log
// (migration 083). Money is bigint paise. All totals are computed client-side in
// paise (see computeLine / computeTotals) and persisted as integers.
import { supabase } from '@/lib/supabase'

const db = supabase as any

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'

export interface Quotation {
  id: string
  deal_id: string
  quote_no: string | null
  version: number
  status: QuotationStatus
  valid_until: string | null
  subtotal: number
  tax_total: number
  discount_total: number
  grand_total: number
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface QuotationLine {
  id: string
  quotation_id: string
  service_id: string | null
  description: string
  quantity: number
  unit_price: number // paise
  discount_percent: number
  gst_rate: number
  hsn_sac: string | null
  line_total: number // paise (incl tax)
}

/** A line as edited in the quotation builder (no id yet). */
export interface LineDraft {
  service_id: string | null
  description: string
  quantity: number
  unit_price: number // paise
  discount_percent: number
  gst_rate: number
  hsn_sac: string | null
}

export interface QuotationTotals {
  subtotal: number // paise, gross before discount
  discount_total: number
  tax_total: number
  grand_total: number
}

export interface LineComputed extends QuotationTotals {
  taxable: number
  line_total: number // paise (incl tax)
}

export interface NewQuotationInput {
  deal_id: string
  valid_until: string | null
  notes: string | null
  status: Extract<QuotationStatus, 'draft' | 'sent'>
  lines: LineDraft[]
}

// ── Money math (all paise, integers) ─────────────────────────────────────────

/** Compute a single line's discount/tax/total in paise. */
export function computeLine(line: LineDraft): LineComputed {
  const gross = Math.round(line.unit_price * line.quantity)
  const discount = Math.round((gross * line.discount_percent) / 100)
  const taxable = gross - discount
  const tax = Math.round((taxable * line.gst_rate) / 100)
  return {
    subtotal: gross,
    discount_total: discount,
    taxable,
    tax_total: tax,
    grand_total: taxable + tax,
    line_total: taxable + tax,
  }
}

/** Roll up all lines into quotation-level totals (paise). */
export function computeTotals(lines: LineDraft[]): QuotationTotals {
  return lines.reduce<QuotationTotals>(
    (acc, l) => {
      const c = computeLine(l)
      return {
        subtotal: acc.subtotal + c.subtotal,
        discount_total: acc.discount_total + c.discount_total,
        tax_total: acc.tax_total + c.tax_total,
        grand_total: acc.grand_total + c.grand_total,
      }
    },
    { subtotal: 0, discount_total: 0, tax_total: 0, grand_total: 0 },
  )
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function fetchQuotations(dealId: string): Promise<Quotation[]> {
  const { data, error } = await db
    .from('sales_quotations')
    .select(
      'id, deal_id, quote_no, version, status, valid_until, subtotal, tax_total, discount_total, grand_total, notes, created_by, created_at',
    )
    .eq('deal_id', dealId)
    .order('version', { ascending: false })
  if (error) throw error
  return (data ?? []) as Quotation[]
}

export async function fetchQuotationLines(quotationId: string): Promise<QuotationLine[]> {
  const { data, error } = await db
    .from('sales_quotation_lines')
    .select(
      'id, quotation_id, service_id, description, quantity, unit_price, discount_percent, gst_rate, hsn_sac, line_total',
    )
    .eq('quotation_id', quotationId)
  if (error) throw error
  return (data ?? []) as QuotationLine[]
}

// ── Writes ─────────────────────────────────────────────────────────────────────

/** Create a quotation (+ its lines) for a deal. Version = max(existing)+1. */
export async function createQuotation(
  input: NewQuotationInput,
  createdBy: string | null,
): Promise<void> {
  const totals = computeTotals(input.lines)

  // Next version for this deal.
  const { data: existing, error: verErr } = await db
    .from('sales_quotations')
    .select('version')
    .eq('deal_id', input.deal_id)
    .order('version', { ascending: false })
    .limit(1)
  if (verErr) throw verErr
  const nextVersion = ((existing?.[0]?.version as number | undefined) ?? 0) + 1

  const { data: quote, error: quoteErr } = await db
    .from('sales_quotations')
    .insert({
      deal_id: input.deal_id,
      version: nextVersion,
      status: input.status,
      valid_until: input.valid_until,
      subtotal: totals.subtotal,
      tax_total: totals.tax_total,
      discount_total: totals.discount_total,
      grand_total: totals.grand_total,
      notes: input.notes?.trim() || null,
      created_by: createdBy,
    })
    .select('id')
    .single()
  if (quoteErr) throw quoteErr

  if (input.lines.length > 0) {
    const rows = input.lines.map((l) => ({
      quotation_id: quote.id,
      service_id: l.service_id,
      description: l.description.trim(),
      quantity: l.quantity,
      unit_price: l.unit_price,
      discount_percent: l.discount_percent,
      gst_rate: l.gst_rate,
      hsn_sac: l.hsn_sac?.trim() || null,
      line_total: computeLine(l).line_total,
    }))
    const { error: linesErr } = await db.from('sales_quotation_lines').insert(rows)
    if (linesErr) throw linesErr
  }
}

export async function updateQuotationStatus(
  id: string,
  status: QuotationStatus,
): Promise<void> {
  const { error } = await db.from('sales_quotations').update({ status }).eq('id', id)
  if (error) throw error
}

// ── Mark Won: order + finance handoff ────────────────────────────────────────

export interface MarkWonInput {
  deal_id: string
  client_id: string | null
  quotation_id: string | null
  total: number // paise
}

/**
 * Record the intent of winning a deal:
 *  1. create a confirmed sales_orders row, and
 *  2. log a sales_handoff_log row (target 'finance', status 'pending').
 * The actual invoice/project creation is owned by the Finance/Operations services;
 * this only records the handoff intent.
 */
export async function createOrderWithHandoff(input: MarkWonInput, createdBy: string | null): Promise<void> {
  const { data: order, error: orderErr } = await db
    .from('sales_orders')
    .insert({
      deal_id: input.deal_id,
      client_id: input.client_id,
      quotation_id: input.quotation_id,
      status: 'confirmed',
      total: input.total,
      created_by: createdBy,
    })
    .select('id')
    .single()
  if (orderErr) throw orderErr

  const { error: handoffErr } = await db.from('sales_handoff_log').insert({
    order_id: order.id,
    target: 'finance',
    status: 'pending',
    detail: 'Invoice creation pending — handed off to Finance on deal win.',
  })
  if (handoffErr) throw handoffErr
}
