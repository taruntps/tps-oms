// HRMS — Payroll (M4): Finance handoff + bank advice. NO auto-GL — Payroll writes zero Finance
// ledger rows. On lock the run creates a `hr_payroll_finance_handoff` (pending); Finance
// reviews/authorizes; the bank advice is only generatable once the handoff is 'authorized'
// (status guard here + intended DB guard). Money = bigint paise (transported as strings).
// Migration 093 tables aren't in the generated Database types yet → `const db = supabase as any`.
import { supabase } from '@/lib/supabase'

const db = supabase as any

export type HandoffStatus = 'pending' | 'finance_review' | 'authorized' | 'paid' | 'rejected'

export interface FinanceHandoff {
  id: string
  run_id: string
  batch_ref: string | null
  amount_total: number
  status: HandoffStatus
  finance_ref: string | null
  authorized_by: string | null
  authorized_at: string | null
  notes: string | null
  created_at: string
}

export async function fetchHandoff(runId: string): Promise<FinanceHandoff | null> {
  const { data, error } = await db.from('hr_payroll_finance_handoff').select('*').eq('run_id', runId).limit(1)
  if (error) throw error
  return ((data ?? [])[0] as FinanceHandoff) ?? null
}

/** Finance moves the batch pending → finance_review → authorized (or rejected). */
export async function setHandoffStatus(
  runId: string,
  status: HandoffStatus,
  opts?: { actorId?: string | null; financeRef?: string | null; notes?: string | null },
): Promise<void> {
  const patch: Record<string, unknown> = { status }
  if (status === 'authorized') {
    patch.authorized_by = opts?.actorId ?? null
    patch.authorized_at = new Date().toISOString()
  }
  if (opts?.financeRef !== undefined) patch.finance_ref = opts.financeRef
  if (opts?.notes !== undefined) patch.notes = opts.notes
  const { error } = await db.from('hr_payroll_finance_handoff').update(patch).eq('run_id', runId)
  if (error) throw error
}

// ── Bank advice (generated only AFTER Finance authorization) ───────────────────
export type BankAdviceStatus = 'pending' | 'finance_approved' | 'generated' | 'exported'

export interface BankAdvice {
  id: string
  run_id: string
  status: BankAdviceStatus
  generated_at: string | null
  generated_by: string | null
  file_document_id: string | null
  finance_batch_ref: string | null
  created_at: string
}
export interface BankAdviceLine {
  id: string
  advice_id: string
  employee_id: string
  bank_ref: string | null
  amount: number
  status: string
}

export async function fetchBankAdvice(runId: string): Promise<BankAdvice | null> {
  const { data, error } = await db.from('hr_bank_advice').select('*').eq('run_id', runId).limit(1)
  if (error) throw error
  return ((data ?? [])[0] as BankAdvice) ?? null
}

export async function fetchBankAdviceLines(adviceId: string): Promise<BankAdviceLine[]> {
  const { data, error } = await db.from('hr_bank_advice_lines').select('*').eq('advice_id', adviceId)
  if (error) throw error
  return (data ?? []) as BankAdviceLine[]
}

/**
 * Generate the bank advice + per-employee lines for a run — ONLY when Finance has authorized
 * the handoff (decision 4: disbursement is human-executed). Pulls each employee's primary
 * bank ref from `hr_employee_bank` (M1) and the net from the payroll lines.
 */
export async function generateBankAdvice(runId: string, actorId?: string | null): Promise<BankAdvice> {
  const handoff = await fetchHandoff(runId)
  if (!handoff || handoff.status !== 'authorized') {
    throw new Error('Bank advice can only be generated after Finance has authorized the handoff.')
  }
  const existing = await fetchBankAdvice(runId)
  if (existing) return existing

  const { data: lines, error: lErr } = await db
    .from('hr_payroll_lines')
    .select('employee_id, net_pay')
    .eq('run_id', runId)
  if (lErr) throw lErr

  const empIds = ((lines ?? []) as any[]).map((l) => l.employee_id)
  const bankByEmp = new Map<string, string>()
  if (empIds.length > 0) {
    const { data: banks } = await db
      .from('hr_employee_bank')
      .select('employee_id, account_no, ifsc, is_primary')
      .in('employee_id', empIds)
    for (const b of (banks ?? []) as any[]) {
      if (b.is_primary || !bankByEmp.has(b.employee_id)) {
        bankByEmp.set(b.employee_id, b.account_no ? `${b.account_no}${b.ifsc ? '/' + b.ifsc : ''}` : '')
      }
    }
  }

  const { data: adviceRow, error: aErr } = await db
    .from('hr_bank_advice')
    .insert({
      run_id: runId,
      status: 'generated',
      generated_at: new Date().toISOString(),
      generated_by: actorId ?? null,
      finance_batch_ref: handoff.batch_ref,
    })
    .select('*')
    .single()
  if (aErr) throw aErr
  const advice = adviceRow as BankAdvice

  const adviceLines = ((lines ?? []) as any[]).map((l) => ({
    advice_id: advice.id,
    employee_id: l.employee_id,
    bank_ref: bankByEmp.get(l.employee_id) ?? null,
    amount: String(l.net_pay),
    status: 'pending',
  }))
  if (adviceLines.length > 0) {
    const { error: alErr } = await db.from('hr_bank_advice_lines').insert(adviceLines)
    if (alErr) throw alErr
  }
  return advice
}

/** Mark the advice exported (bank file downloaded). */
export async function markBankAdviceExported(adviceId: string): Promise<void> {
  const { error } = await db.from('hr_bank_advice').update({ status: 'exported' }).eq('id', adviceId)
  if (error) throw error
}
