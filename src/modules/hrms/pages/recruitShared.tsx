// HRMS — Recruitment & Lifecycle (M5): shared presentational helpers.
const TONE = {
  slate: 'bg-slate-50 border-slate-200 text-slate-600',
  amber: 'bg-amber-50 border-amber-200 text-amber-700',
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
  green: 'bg-green-50 border-green-200 text-green-700',
  violet: 'bg-violet-50 border-violet-200 text-violet-700',
  red: 'bg-red-50 border-red-200 text-red-700',
} as const

const STATUS_TONE: Record<string, keyof typeof TONE> = {
  // requisitions
  draft: 'slate', pending: 'amber', approved: 'green', on_hold: 'violet', closed: 'slate', rejected: 'red',
  // postings
  open: 'green',
  // candidates / applications
  new: 'slate', screening: 'amber', interview: 'blue', offer: 'violet', hired: 'green', active: 'blue',
  withdrawn: 'slate',
  // interviews
  scheduled: 'amber', done: 'green', cancelled: 'slate', no_show: 'red',
  // offers
  sent: 'blue', accepted: 'green', declined: 'red', expired: 'slate',
  // separations
  initiated: 'amber', exit_interview: 'blue', clearance: 'violet', fnf: 'blue', completed: 'green',
  // fnf / onboarding
  paid: 'green', in_progress: 'amber', waived: 'slate',
}

export function StatusPill({ status }: { status: string | null | undefined }) {
  const s = status ?? '—'
  const tone = TONE[STATUS_TONE[s] ?? 'slate']
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded border capitalize ${tone}`}>
      {s.replace(/_/g, ' ')}
    </span>
  )
}

const REC_TONE: Record<string, keyof typeof TONE> = { hire: 'green', hold: 'amber', reject: 'red' }

export function RecommendationPill({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-muted-foreground">—</span>
  const tone = TONE[REC_TONE[value] ?? 'slate']
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded border capitalize ${tone}`}>
      {value}
    </span>
  )
}

/** Today (IST) as YYYY-MM-DD — for default date inputs. */
export function istToday(): string {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000)
  return ist.toISOString().slice(0, 10)
}

export const inputCls =
  'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'

/** Parse a rupee string (e.g. "12.5" lakh-agnostic plain rupees) into paise, or null. */
export function rupeesToPaise(v: string): number | null {
  const n = Number(v)
  if (!v.trim() || Number.isNaN(n)) return null
  return Math.round(n * 100)
}
