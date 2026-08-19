// HRMS — ESS (M9): consolidated Employee Self-Service hub (/hrms/me).
// Frontend-only; links to existing self-scoped surfaces and surfaces a few live counts.
import { Link } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useCan } from '@/core/access/useCan'
import { useAuth } from '@/contexts/AuthContext'
import { useMyEnrolments, useMyCertifications } from '../hooks/useTraining'
import { useMyAssets } from '../hooks/useAssets'

type Tile = { to: string; label: string; desc: string; icon: string; perm: string; badge?: number }

export default function MyHubPage() {
  const { user, profile } = useAuth()
  const uid = user?.id ?? ''
  const { data: enrolments = [] } = useMyEnrolments(uid)
  const { data: certs = [] } = useMyCertifications(uid)
  const { data: assets = [] } = useMyAssets(uid)

  const tiles: Tile[] = [
    { to: '/hrms/attendance/me', label: 'My Attendance', desc: 'Punch in/out & regularise', icon: 'schedule', perm: 'hrms.attendance.self' },
    { to: '/hrms/leave/me', label: 'My Leave', desc: 'Apply & track balances', icon: 'beach_access', perm: 'hrms.leave.apply' },
    { to: '/hrms/short-leave', label: 'Short Leave', desc: '2 hours a month, on approval', icon: 'hourglass_bottom', perm: 'hrms.ess.view' },
    { to: '/hrms/holidays', label: 'Holidays', desc: 'Company holiday calendar', icon: 'celebration', perm: 'hrms.ess.view' },
    { to: '/hrms/profile', label: 'My Profile', desc: 'Fill your details for approval', icon: 'contact_page', perm: 'hrms.ess.view' },
    { to: '/hrms/payroll/payslips', label: 'My Payslips', desc: 'Download payslips', icon: 'description', perm: 'hrms.payslip.self' },
    { to: '/hrms/performance/me', label: 'My Performance', desc: 'Goals & reviews', icon: 'star', perm: 'hrms.performance.review.self' },
    { to: '/hrms/training/me', label: 'My Training', desc: 'Enrolments & certifications', icon: 'cast_for_education', perm: 'hrms.training.view.self', badge: (enrolments as any[]).length + (certs as any[]).length },
    { to: '/hrms/assets/me', label: 'My Assets', desc: 'Assigned company assets', icon: 'laptop_mac', perm: 'hrms.asset.view.self', badge: (assets as any[]).length },
  ]

  return (
    <div>
      <TopBar title={`Hello${profile?.name ? ', ' + profile.name.split(' ')[0] : ''}`} subtitle="Your self-service hub" />
      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tiles.map((t) => <TileCard key={t.to} tile={t} />)}
        </div>
      </div>
    </div>
  )
}

function TileCard({ tile }: { tile: Tile }) {
  const can = useCan(tile.perm as any)
  if (!can) return null
  return (
    <Link to={tile.to} className="group border border-border rounded-xl bg-white p-5 hover:border-brand-400 hover:shadow-sm transition flex items-start gap-4">
      <div className="shrink-0 w-11 h-11 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center group-hover:bg-brand-100">
        <Sym name={tile.icon} size={22} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="font-display font-semibold text-brand-950">{tile.label}</div>
          {tile.badge != null && tile.badge > 0 && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-brand-600 text-white">{tile.badge}</span>}
        </div>
        <div className="text-[12px] text-muted-foreground mt-0.5">{tile.desc}</div>
      </div>
      <Sym name="chevron_right" size={18} className="ml-auto text-muted-foreground group-hover:text-brand-600" />
    </Link>
  )
}
