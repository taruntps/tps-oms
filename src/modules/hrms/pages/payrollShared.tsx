// HRMS — Payroll (M4) shared UI helpers: status pills, money/day formatting, month names.
import type { RunStatus } from '../api/payroll'
import type { HandoffStatus } from '../api/payrollFinance'

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function monthName(m: number): string {
  return MONTHS[m - 1] ?? String(m)
}

/** Format a paise value (bigint | number | numeric-string) as ₹ via ÷100. */
export function fmtPaise(paise: number | string | bigint | null | undefined): string {
  if (paise == null) return '—'
  const n = typeof paise === 'bigint' ? Number(paise) : Number(paise)
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n / 100)
}

export function fmtDays(n: number | null | undefined): string {
  if (n == null) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

const RUN_STYLES: Record<RunStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  computed: 'bg-blue-100 text-blue-700',
  approved: 'bg-amber-100 text-amber-700',
  locked: 'bg-violet-100 text-violet-700',
  paid: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-rose-100 text-rose-700',
}

export function RunStatusPill({ status }: { status: RunStatus }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${RUN_STYLES[status] ?? 'bg-slate-100 text-slate-700'}`}>
      {status}
    </span>
  )
}

const HANDOFF_STYLES: Record<HandoffStatus, string> = {
  pending: 'bg-slate-100 text-slate-700',
  finance_review: 'bg-blue-100 text-blue-700',
  authorized: 'bg-emerald-100 text-emerald-700',
  paid: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
}

export function HandoffStatusPill({ status }: { status: HandoffStatus }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${HANDOFF_STYLES[status] ?? 'bg-slate-100 text-slate-700'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

export const inputCls =
  'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'
