// HRMS — Dashboards & Reports (M10): HR/Director/Manager overview (/hrms/dashboard).
// Gated hrms.dashboard.view. Aggregates via hr_dashboard_stats() RPC (non-PII counts).
import { Link } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useDashboardStats } from '../hooks/useDashboard'
import type { DashboardStats } from '../api/dashboard'

type Stat = { key: keyof DashboardStats; label: string; icon: string; to?: string; tone?: 'default' | 'alert' }

const STATS: Stat[] = [
  { key: 'headcount', label: 'Active Employees', icon: 'groups', to: '/hrms/employees' },
  { key: 'on_leave_today', label: 'On Leave Today', icon: 'beach_access', to: '/hrms/leave' },
  { key: 'pending_leave', label: 'Leave Approvals', icon: 'how_to_reg', to: '/hrms/leave/approvals', tone: 'alert' },
  { key: 'pending_attendance', label: 'Attendance Approvals', icon: 'approval', to: '/hrms/attendance/approvals', tone: 'alert' },
  { key: 'open_requisitions', label: 'Open Requisitions', icon: 'work', to: '/hrms/recruit/requisitions' },
  { key: 'pending_reviews', label: 'Pending Reviews', icon: 'star', to: '/hrms/performance' },
  { key: 'expiring_certs', label: 'Certs Expiring (30d)', icon: 'verified', to: '/hrms/training/certifications', tone: 'alert' },
  { key: 'assets_issued', label: 'Assets Issued', icon: 'laptop_mac', to: '/hrms/assets' },
]

export default function DashboardPage() {
  const { data, isLoading, error } = useDashboardStats()

  return (
    <div>
      <TopBar title="HR Dashboard" subtitle="Organisation at a glance" />
      <div className="p-6">
        {error && <div className="mb-4 text-sm text-red-600">Failed to load stats.</div>}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATS.map((s) => {
            const value = isLoading ? '…' : (data?.[s.key] ?? 0)
            const alert = s.tone === 'alert' && !isLoading && Number(data?.[s.key] ?? 0) > 0
            const card = (
              <div className={`border rounded-xl bg-white p-5 h-full ${alert ? 'border-amber-300 bg-amber-50/40' : 'border-border'} ${s.to ? 'hover:border-brand-400 hover:shadow-sm transition' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${alert ? 'bg-amber-100 text-amber-700' : 'bg-brand-50 text-brand-700'}`}><Sym name={s.icon} size={18} /></div>
                  {s.to && <Sym name="chevron_right" size={16} className="text-muted-foreground" />}
                </div>
                <div className="mt-3 text-2xl font-display font-semibold text-brand-950 tabular-nums">{value}</div>
                <div className="text-[12px] text-muted-foreground">{s.label}</div>
              </div>
            )
            return s.to ? <Link key={s.key} to={s.to}>{card}</Link> : <div key={s.key}>{card}</div>
          })}
        </div>

        <div className="mt-6 border border-border rounded-xl bg-white p-5">
          <div className="text-xs font-semibold text-brand-950 mb-3">Reports</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
            <Link to="/hrms/attendance/reports" className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#F8FAFC]"><Sym name="fact_check" size={16} className="text-brand-600" /> Attendance report</Link>
            <Link to="/hrms/performance/reports" className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#F8FAFC]"><Sym name="insights" size={16} className="text-brand-600" /> Performance report</Link>
            <Link to="/hrms/leave" className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#F8FAFC]"><Sym name="event_available" size={16} className="text-brand-600" /> Leave register</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
