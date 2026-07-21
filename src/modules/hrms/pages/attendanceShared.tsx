// HRMS — Attendance (M2): small shared presentational helpers.
import type { AttendanceStatus, RequestStatus } from '../api/attendance'

/** Worked minutes → "8h 15m" (blank when null). */
export function fmtMinutes(min: number | null | undefined): string {
  if (min == null) return '—'
  const m = Math.round(min)
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${r}m`
  return r === 0 ? `${h}h` : `${h}h ${r}m`
}

/** HH:MM (IST) for a timestamptz, or "—". */
export function fmtTime(ts: string | null | undefined): string {
  if (!ts) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
  }).format(new Date(ts))
}

const STATUS_TONE: Record<string, string> = {
  present: 'bg-green-50 border-green-200 text-green-700',
  wfh: 'bg-green-50 border-green-200 text-green-700',
  od: 'bg-blue-50 border-blue-200 text-blue-700',
  half_day: 'bg-amber-50 border-amber-200 text-amber-700',
  on_leave: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  weekly_off: 'bg-slate-50 border-slate-200 text-slate-600',
  holiday: 'bg-slate-50 border-slate-200 text-slate-600',
  pending: 'bg-slate-50 border-slate-200 text-slate-500',
  absent: 'bg-red-50 border-red-200 text-red-700',
}

export function AttendanceStatusPill({ status }: { status: AttendanceStatus | string | null | undefined }) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>
  const tone = STATUS_TONE[status] ?? 'bg-slate-50 border-slate-200 text-slate-600'
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded border capitalize ${tone}`}>
      {String(status).replace('_', ' ')}
    </span>
  )
}

const REQ_TONE: Record<RequestStatus, string> = {
  pending: 'bg-amber-50 border-amber-200 text-amber-700',
  approved: 'bg-green-50 border-green-200 text-green-700',
  rejected: 'bg-red-50 border-red-200 text-red-700',
  cancelled: 'bg-slate-50 border-slate-200 text-slate-500',
}

export function RequestStatusPill({ status }: { status: RequestStatus }) {
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded border capitalize ${REQ_TONE[status]}`}>
      {status}
    </span>
  )
}

/** IST date range (YYYY-MM-DD) for a given year/month (0-based month). */
export function monthRange(year: number, month: number): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const from = `${year}-${pad(month + 1)}-01`
  const last = new Date(year, month + 1, 0).getDate()
  const to = `${year}-${pad(month + 1)}-${pad(last)}`
  return { from, to }
}

/** Today in IST as YYYY-MM-DD. */
export function istToday(): string {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000)
  return ist.toISOString().slice(0, 10)
}
