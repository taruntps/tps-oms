// HRMS — Assets (M8) shared UI helpers.
import type { AssetStatus } from '../api/assets'

export const inputCls = 'w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30'

const STATUS_STYLES: Record<AssetStatus, string> = {
  in_stock: 'bg-emerald-50 text-emerald-700',
  issued: 'bg-blue-50 text-blue-700',
  repair: 'bg-amber-50 text-amber-700',
  retired: 'bg-gray-100 text-gray-500',
}

export function AssetStatusPill({ status }: { status: AssetStatus }) {
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600'}`}>{status.replace('_', ' ')}</span>
}
