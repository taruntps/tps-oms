import { useNavigate } from 'react-router-dom'
import { TrendingUp, Users, FolderKanban, AlertTriangle, IndianRupee } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { useDirectorStats, useProjectPipeline } from '@/hooks/useDashboard'
import { formatRupees, formatDate, cn } from '@/lib/utils'

export default function DirectorPage() {
  const navigate = useNavigate()
  const { data: stats, isLoading: loadingStats } = useDirectorStats()
  const { data: pipeline = [], isLoading: loadingPipeline } = useProjectPipeline()

  return (
    <div>
      <TopBar title="Director View" subtitle="Business overview & KPIs" />

      <div className="p-6 space-y-6 animate-fade-up">

        {/* ── KPI row ── */}
        {loadingStats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-pulse">
            {[1,2,3,4].map(i => <div key={i} className="h-24 bg-white rounded-xl border border-border" />)}
          </div>
        ) : stats && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard icon={FolderKanban}  label="Active Projects"  value={stats.active}        sub={`${stats.total} total`}        color="brand" />
              <KpiCard icon={TrendingUp}    label="Completed"         value={stats.completed}     sub="all time"                      color="green" />
              <KpiCard icon={Users}         label="Active Clients"    value={stats.activeClients} sub="registered"                    color="blue"  />
              <KpiCard icon={AlertTriangle} label="Pending Blocks"    value={stats.pendingBlocks} sub="need approval"                 color={stats.pendingBlocks > 0 ? 'red' : 'gray'} />
            </div>

            {/* ── Revenue row ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <RevenueCard label="Total Billed" value={stats.totalRevenue}   color="green" note="payments received" />
              <RevenueCard label="Total Quoted" value={stats.quotedTotal}    color="brand" note="across all projects" />
              <RevenueCard label="Pending Payment" value={stats.pendingPayment} color={stats.pendingPayment > 0 ? 'amber' : 'gray'} note="quoted − paid" />
            </div>

            {/* ── Clock distribution ── */}
            <div className="bg-white rounded-xl border border-border p-5">
              <h3 className="font-display font-semibold text-brand-950 text-sm mb-4">Active Project Clock Distribution</h3>
              <div className="grid grid-cols-3 gap-4">
                <ClockBar label="🟢 Employee" value={stats.onEmployee}  total={stats.active} color="bg-green-500" />
                <ClockBar label="🟡 Client"   value={stats.onClient}    total={stats.active} color="bg-amber-400" />
                <ClockBar label="🔵 FSSAI"    value={stats.onAuthority} total={stats.active} color="bg-blue-500"  />
              </div>
              {stats.blocked > 0 && (
                <p className="mt-3 text-xs text-red-600 flex items-center gap-1.5">
                  <AlertTriangle size={11} />
                  {stats.blocked} project{stats.blocked > 1 ? 's' : ''} currently blocked — approval needed
                </p>
              )}
            </div>
          </>
        )}

        {/* ── Project pipeline ── */}
        <div>
          <h2 className="font-display font-semibold text-brand-950 text-sm mb-3">Recent Project Pipeline</h2>
          {loadingPipeline ? (
            <div className="space-y-2 animate-pulse">
              {[1,2,3].map(i => <div key={i} className="h-16 bg-white rounded-xl border border-border" />)}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-border">
                    <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Project</th>
                    <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-medium hidden md:table-cell">Client</th>
                    <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-medium hidden sm:table-cell">Executive</th>
                    <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Status</th>
                    <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wide text-muted-foreground font-medium hidden sm:table-cell">Quoted</th>
                    <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-medium hidden md:table-cell">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {pipeline.map((p, idx) => (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className={cn('cursor-pointer hover:bg-brand-50/30 transition-colors', idx < pipeline.length - 1 && 'border-b border-border')}
                    >
                      <td className="px-4 py-3">
                        <p className="font-mono text-[10px] text-muted-foreground">{p.project_code}</p>
                        <p className="font-medium text-brand-950 mt-0.5">{p.project_name}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{(p as any).clients?.company_name}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{(p as any).profiles_assigned?.name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-medium capitalize',
                          p.status === 'active'    ? 'bg-green-100 text-green-700' :
                          p.status === 'on_hold'   ? 'bg-amber-100 text-amber-700' :
                          p.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        )}>
                          {p.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono hidden sm:table-cell">
                        {p.quoted_amount ? formatRupees(p.quoted_amount) : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                        {formatDate(p.target_date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: number; sub: string;
  color: 'brand' | 'green' | 'blue' | 'red' | 'gray'
}) {
  const cls = {
    brand: 'bg-brand-50 border-brand-200 text-brand-600',
    green: 'bg-green-50 border-green-200 text-green-600',
    blue:  'bg-blue-50 border-blue-200 text-blue-600',
    red:   'bg-red-50 border-red-200 text-red-600',
    gray:  'bg-[#F8FAFC] border-border text-muted-foreground',
  }[color]
  return (
    <div className={cn('rounded-xl border p-4', cls)}>
      <Icon size={18} className="mb-2 opacity-80" />
      <p className="text-3xl font-display font-bold">{value}</p>
      <p className="text-xs font-semibold mt-0.5">{label}</p>
      <p className="text-[11px] opacity-60 mt-0.5">{sub}</p>
    </div>
  )
}

function RevenueCard({ label, value, color, note }: {
  label: string; value: number; note: string;
  color: 'green' | 'brand' | 'amber' | 'gray'
}) {
  const cls = {
    green: 'bg-green-50 border-green-200',
    brand: 'bg-brand-50 border-brand-200',
    amber: 'bg-amber-50 border-amber-200',
    gray:  'bg-[#F8FAFC] border-border',
  }[color]
  return (
    <div className={cn('rounded-xl border p-5', cls)}>
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        <IndianRupee size={13} />
        <p className="text-xs font-medium">{label}</p>
      </div>
      <p className="text-2xl font-display font-bold text-brand-950">{formatRupees(value)}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{note}</p>
    </div>
  )
}

function ClockBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-brand-950">{label}</span>
        <span className="text-xs font-mono text-muted-foreground">{value} ({pct}%)</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
