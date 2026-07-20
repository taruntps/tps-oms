// Finance — dashboard (/finance).
// Summary cards: total outstanding, this-month collections, government fees
// pending. Gated to finance.report.view (ProtectedRoute already restricts roles).
import { useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { formatRupees } from '@/lib/utils'
import { useCan } from '@/core/access/useCan'
import { useAuth } from '@/contexts/AuthContext'
import { useFinanceSummary } from '../hooks/useFinanceDashboard'

export default function FinanceDashboard() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canViewByPerm = useCan('finance.report.view')
  // ProtectedRoute restricts the route; role fallback covers users without a
  // seeded grant-based permission row.
  const canView =
    canViewByPerm || profile?.role === 'super_admin' || profile?.role === 'director'

  const { data, isLoading, error } = useFinanceSummary()

  return (
    <div>
      <TopBar title="Finance" subtitle="Accounts & billing overview" />

      <div className="p-6 space-y-6 animate-fade-up">
        {!canView ? (
          <div className="bg-white rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
            You don't have permission to view financial reports.
          </div>
        ) : error ? (
          <ErrorPanel message={(error as Error).message} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card
              label="Total Outstanding"
              value={data ? formatRupees(data.outstanding) : '—'}
              icon="account_balance_wallet"
              accent="text-amber-700"
              loading={isLoading}
              onClick={() => navigate('/finance/invoices')}
            />
            <Card
              label="Collections (This Month)"
              value={data ? formatRupees(data.collectionsThisMonth) : '—'}
              icon="trending_up"
              accent="text-emerald-700"
              loading={isLoading}
              onClick={() => navigate('/finance/payments')}
            />
            <Card
              label="Govt Fees Pending"
              value={data ? formatRupees(data.govtFeesPending) : '—'}
              icon="gavel"
              accent="text-blue-700"
              loading={isLoading}
              onClick={() => navigate('/finance/govt-fees')}
            />
            <Card
              label="Open Invoices"
              value={data ? String(data.openInvoiceCount) : '—'}
              icon="receipt_long"
              accent="text-brand-700"
              loading={isLoading}
              onClick={() => navigate('/finance/invoices')}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function Card({
  label,
  value,
  icon,
  accent,
  loading,
  onClick,
}: {
  label: string
  value: string
  icon: string
  accent: string
  loading?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-white rounded-xl border border-border p-5 hover:border-brand-600/30 hover:shadow-sm transition-all"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
        <Sym name={icon} size={18} className={accent} />
      </div>
      {loading ? (
        <div className="h-7 w-24 rounded bg-gray-100 animate-pulse" />
      ) : (
        <p className={`text-2xl font-display font-semibold ${accent}`}>{value}</p>
      )}
    </button>
  )
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="bg-white rounded-xl border border-border p-4 text-sm">
      <div className="flex items-start gap-2">
        <Sym name="error" size={16} className="mt-0.5 shrink-0 text-red-500" />
        <div>
          <p className="font-medium mb-1 text-brand-950">Couldn't load the finance summary</p>
          <p className="text-xs text-muted-foreground">{message}</p>
        </div>
      </div>
    </div>
  )
}
