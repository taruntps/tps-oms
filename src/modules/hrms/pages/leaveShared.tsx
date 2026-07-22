// HRMS — Leave (M3): small shared presentational helpers.
import type { RequestStatus } from '../api/leave'

const REQ_TONE: Record<RequestStatus, string> = {
  pending: 'bg-amber-50 border-amber-200 text-amber-700',
  approved: 'bg-green-50 border-green-200 text-green-700',
  rejected: 'bg-red-50 border-red-200 text-red-700',
  cancelled: 'bg-slate-50 border-slate-200 text-slate-500',
}

export function LeaveStatusPill({ status }: { status: RequestStatus }) {
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded border capitalize ${REQ_TONE[status]}`}>
      {status}
    </span>
  )
}

const ENC_TONE: Record<string, string> = {
  requested: 'bg-amber-50 border-amber-200 text-amber-700',
  approved: 'bg-blue-50 border-blue-200 text-blue-700',
  paid: 'bg-green-50 border-green-200 text-green-700',
  rejected: 'bg-red-50 border-red-200 text-red-700',
}

export function EncashmentStatusPill({ status }: { status: string }) {
  const tone = ENC_TONE[status] ?? 'bg-slate-50 border-slate-200 text-slate-500'
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded border capitalize ${tone}`}>
      {status}
    </span>
  )
}

/** Format a signed balance (days), e.g. "12.5" or "−1". */
export function fmtDays(n: number | null | undefined): string {
  if (n == null) return '—'
  const s = Number(n)
  const rounded = Math.round(s * 100) / 100
  return String(rounded)
}

/** Today in IST as YYYY-MM-DD. */
export function istToday(): string {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000)
  return ist.toISOString().slice(0, 10)
}

/** Current calendar year (IST). */
export function istYear(): number {
  return Number(istToday().slice(0, 4))
}
