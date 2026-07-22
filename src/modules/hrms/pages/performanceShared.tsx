// HRMS — Performance Management (M6): shared presentational helpers.
const TONE = {
  slate: 'bg-slate-50 border-slate-200 text-slate-600',
  amber: 'bg-amber-50 border-amber-200 text-amber-700',
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
  green: 'bg-green-50 border-green-200 text-green-700',
  violet: 'bg-violet-50 border-violet-200 text-violet-700',
  red: 'bg-red-50 border-red-200 text-red-700',
} as const

const STATUS_TONE: Record<string, keyof typeof TONE> = {
  // cycles
  open: 'blue', in_review: 'amber', calibration: 'violet', closed: 'slate',
  // goals
  active: 'blue', achieved: 'green', partial: 'amber', dropped: 'slate',
  // reviews
  draft: 'slate', submitted: 'green',
  // recommendations
  proposed: 'amber', approved: 'green', rejected: 'red',
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

const CATEGORY_TONE: Record<string, keyof typeof TONE> = { KRA: 'violet', KPI: 'blue', goal: 'slate' }

export function CategoryPill({ category }: { category: string }) {
  const tone = TONE[CATEGORY_TONE[category] ?? 'slate']
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${tone}`}>{category}</span>
  )
}

/** Render a rating (0–5) with one decimal, or an em-dash when unset. */
export function fmtRating(n: number | null | undefined): string {
  if (n == null) return '—'
  return (Math.round(Number(n) * 10) / 10).toFixed(1)
}

/** Today (IST) as YYYY-MM-DD — for default date inputs. */
export function istToday(): string {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000)
  return ist.toISOString().slice(0, 10)
}

export const inputCls =
  'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600'

/** Parse a rating string (0–5) to a clamped number, or null. */
export function parseRating(v: string): number | null {
  const n = Number(v)
  if (!v.trim() || Number.isNaN(n)) return null
  return Math.min(5, Math.max(0, Math.round(n * 10) / 10))
}
