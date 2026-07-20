// Finance — dashboard summary aggregations (all money in paise).
import { supabase } from '@/lib/supabase'

const db = supabase as any

export interface FinanceSummary {
  outstanding: number // Σ(grand_total − amount_paid) over issued/partially_paid, paise
  collectionsThisMonth: number // Σ payment amount in the current month, paise
  govtFeesPending: number // Σ pending govt-fee amount, paise
  openInvoiceCount: number
}

function monthStartISO(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
}

export async function fetchFinanceSummary(): Promise<FinanceSummary> {
  const [invoicesRes, paymentsRes, govtRes] = await Promise.all([
    db
      .from('finance_invoices')
      .select('grand_total, amount_paid, status')
      .in('status', ['issued', 'partially_paid']),
    db.from('payments').select('amount, payment_date').gte('payment_date', monthStartISO()),
    db.from('finance_govt_fees').select('amount, status').eq('status', 'pending'),
  ])
  if (invoicesRes.error) throw invoicesRes.error
  if (paymentsRes.error) throw paymentsRes.error
  if (govtRes.error) throw govtRes.error

  const invoices = (invoicesRes.data ?? []) as { grand_total: number; amount_paid: number }[]
  const outstanding = invoices.reduce((s, i) => s + Math.max(0, i.grand_total - i.amount_paid), 0)

  const payments = (paymentsRes.data ?? []) as { amount: number }[]
  const collectionsThisMonth = payments.reduce((s, p) => s + p.amount, 0)

  const govt = (govtRes.data ?? []) as { amount: number }[]
  const govtFeesPending = govt.reduce((s, g) => s + g.amount, 0)

  return { outstanding, collectionsThisMonth, govtFeesPending, openInvoiceCount: invoices.length }
}
