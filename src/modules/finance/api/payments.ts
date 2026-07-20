// Finance — payments data access. Reuses the EXISTING `payments` table
// (columns: amount[paise], client_id, project_id, payment_date, payment_mode,
// invoice_no, reference_no, notes, recorded_by) plus the new nullable
// `invoice_id` added in migration 084 to link a payment to a finance invoice.
import { supabase } from '@/lib/supabase'
import type { InvoiceRow, InvoiceStatus } from './invoices'

const db = supabase as any

export const PAYMENT_MODES = ['Cash', 'NEFT', 'IMPS', 'UPI', 'Cheque', 'RTGS', 'Card', 'Other'] as const

export interface PaymentRow {
  id: string
  amount: number // paise
  client_id: string
  project_id: string
  invoice_id: string | null
  payment_date: string
  payment_mode: string
  invoice_no: string | null
  reference_no: string | null
  notes: string | null
  recorded_by: string | null
  created_at: string
  client?: { company_name: string | null; trade_name: string | null } | null
  invoice?: { id: string; invoice_no: string | null } | null
}

const PAYMENT_JOINS =
  'client:clients(company_name, trade_name), invoice:finance_invoices(id, invoice_no)'

/** All payments (newest first), with client + linked-invoice lookups. */
export async function fetchPayments(): Promise<PaymentRow[]> {
  const { data, error } = await db
    .from('payments')
    .select(`*, ${PAYMENT_JOINS}`)
    .order('payment_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as PaymentRow[]
}

/** Payments linked to one invoice. */
export async function fetchInvoicePayments(invoiceId: string): Promise<PaymentRow[]> {
  const { data, error } = await db
    .from('payments')
    .select(`*, ${PAYMENT_JOINS}`)
    .eq('invoice_id', invoiceId)
    .order('payment_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as PaymentRow[]
}

export interface PaymentInput {
  client_id: string
  project_id: string
  invoice_id: string | null
  amount: number // paise
  payment_date: string
  payment_mode: string
  reference_no: string | null
  notes: string | null
}

async function insertPayment(input: PaymentInput, recordedBy: string | null): Promise<void> {
  const { error } = await db.from('payments').insert({
    client_id: input.client_id,
    project_id: input.project_id,
    invoice_id: input.invoice_id,
    amount: input.amount,
    payment_date: input.payment_date,
    payment_mode: input.payment_mode,
    reference_no: input.reference_no,
    notes: input.notes,
    recorded_by: recordedBy,
  })
  if (error) throw error
}

/** Record a standalone payment (not tied to an invoice's running balance). */
export async function recordStandalonePayment(
  input: PaymentInput,
  recordedBy: string | null,
): Promise<void> {
  await insertPayment(input, recordedBy)
}

/**
 * Record a payment against an invoice: insert the payment, then bump the
 * invoice's amount_paid and recompute its status (partially_paid / paid).
 */
export async function recordInvoicePayment(
  invoice: InvoiceRow,
  input: PaymentInput,
  recordedBy: string | null,
): Promise<void> {
  // Guard #4: payments only make sense on an issued (or part-paid) invoice.
  // draft/cancelled/paid are rejected before any write.
  if (invoice.status !== 'issued' && invoice.status !== 'partially_paid') {
    throw new Error('Payments allowed only on issued invoices')
  }

  // Guard #2: amount must be positive and must not exceed the outstanding
  // balance (money is bigint paise). Validate BEFORE inserting the payment.
  const balance = invoice.grand_total - invoice.amount_paid
  if (input.amount <= 0) throw new Error('Amount must be positive')
  if (input.amount > balance) throw new Error('Payment exceeds balance')

  await insertPayment(input, recordedBy)

  const newPaid = invoice.amount_paid + input.amount
  const status: InvoiceStatus =
    newPaid >= invoice.grand_total && invoice.grand_total > 0 ? 'paid' : 'partially_paid'
  const { error } = await db
    .from('finance_invoices')
    .update({ amount_paid: newPaid, status, updated_at: new Date().toISOString() })
    .eq('id', invoice.id)
  if (error) throw error
}
