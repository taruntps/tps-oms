// HRMS — Training & Development (M7): shared presentational helpers.
const TONE = {
  slate: 'bg-slate-50 border-slate-200 text-slate-600',
  amber: 'bg-amber-50 border-amber-200 text-amber-700',
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
  green: 'bg-green-50 border-green-200 text-green-700',
  violet: 'bg-violet-50 border-violet-200 text-violet-700',
  red: 'bg-red-50 border-red-200 text-red-700',
} as const

const STATUS_TONE: Record<string, keyof typeof TONE> = {
  // trainings
  planned: 'blue', ongoing: 'amber', completed: 'green', cancelled: 'slate',
  // enrolments
  nominated: 'blue', attended: 'violet', no_show: 'red',
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

const TYPE_TONE: Record<string, keyof typeof TONE> = { internal: 'blue', external: 'violet' }

export function TypePill({ type }: { type: string }) {
  const tone = TONE[TYPE_TONE[type] ?? 'slate']
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded border capitalize ${tone}`}>{type}</span>
  )
}

/** Today (IST) as YYYY-MM-DD — for default date inputs / expiry comparisons. */
export function istToday(): string {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000)
  return ist.toISOString().slice(0, 10)
}

/** Whole days until `expiresOn` (negative = already expired), or null when unset. */
export function daysUntil(expiresOn: string | null | undefined): number | null {
  if (!expiresOn) return null
  const today = new Date(istToday() + 'T00:00:00Z').getTime()
  const exp = new Date(expiresOn + 'T00:00:00Z').getTime()
  return Math.round((exp - today) / 86_400_000)
}

/**
 * Expiry pill: red when expired, amber within 30 days, green beyond, slate when no date.
 * Drives the CertificationsPage expiry highlighting.
 */
export function ExpiryPill({ expiresOn }: { expiresOn: string | null | undefined }) {
  const d = daysUntil(expiresOn)
  if (d == null) return <span className="text-[11px] text-muted-foreground">—</span>
  const tone = d < 0 ? TONE.red : d <= 30 ? TONE.amber : TONE.green
  const label = d < 0 ? `Expired ${-d}d ago` : d === 0 ? 'Expires today' : `${d}d left`
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${tone}`}>{label}</span>
}

/** Row-highlight class for a certification nearing/past expiry. */
export function expiryRowCls(expiresOn: string | null | undefined): string {
  const d = daysUntil(expiresOn)
  if (d == null) return ''
  if (d < 0) return 'bg-red-50/60'
  if (d <= 30) return 'bg-amber-50/60'
  return ''
}

export const inputCls =
  'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'

/** Parse a score string (0–100) to a clamped number, or null. */
export function parseScore(v: string): number | null {
  const n = Number(v)
  if (!v.trim() || Number.isNaN(n)) return null
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100))
}
