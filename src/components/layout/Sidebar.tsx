import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Building2, FolderKanban, Users,
  BookOpen, BarChart3, Settings, TrendingUp, ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import type { UserRole } from '@/types'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  roles: UserRole[]
}

const NAV: NavItem[] = [
  { href: '/dashboard',          label: 'My Dashboard',   icon: LayoutDashboard, roles: ['super_admin','director','manager','executive','accounts','hr','auditor'] },
  { href: '/director',           label: 'Director View',  icon: TrendingUp,      roles: ['super_admin','director'] },
  { href: '/operations',         label: 'Operations',     icon: ShieldCheck,     roles: ['super_admin','director','manager'] },
  { href: '/clients',            label: 'Clients',        icon: Building2,       roles: ['super_admin','director','manager','executive','accounts','auditor'] },
  { href: '/projects',           label: 'Projects',       icon: FolderKanban,    roles: ['super_admin','director','manager','executive'] },
  { href: '/employees',          label: 'Employees',      icon: Users,           roles: ['super_admin','director','manager','hr'] },
  { href: '/knowledge',          label: 'Knowledge Base', icon: BookOpen,        roles: ['super_admin','director','manager','executive','auditor'] },
  { href: '/reports/performance',label: 'Reports',        icon: BarChart3,       roles: ['super_admin','director','manager'] },
  { href: '/settings',           label: 'Settings',       icon: Settings,        roles: ['super_admin'] },
  { href: '/admin/users',        label: 'User Management',icon: Users,           roles: ['super_admin','director'] },
]

export function Sidebar() {
  const { profile, signOut } = useAuth()
  const role = profile?.role as UserRole | undefined

  return (
    <aside className="w-60 min-h-screen bg-brand-950 flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0 shadow-lg overflow-hidden p-0.5">
            <img src="/logo.png" alt="TPS" className="w-full h-full object-contain" />
          </div>
          <div>
            <p className="text-white font-display font-semibold text-sm leading-tight">TPS Operations</p>
            <p className="text-brand-400 text-[10px] font-mono mt-0.5">portal.tpsxpert.com</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.filter(item => role && item.roles.includes(role)).map(item => (
          <NavLink
            key={item.href}
            to={item.href}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all group',
              isActive
                ? 'bg-brand-600 text-white font-medium shadow-sm'
                : 'text-brand-300 hover:bg-white/8 hover:text-white'
            )}
          >
            <item.icon size={15} className="shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      {profile && (
        <div className="px-3 py-3 border-t border-white/10">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">
                {profile.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{profile.name}</p>
              <p className="text-brand-400 text-[10px] capitalize">{profile.role.replace('_', ' ')}</p>
            </div>
            <button
              onClick={signOut}
              className="text-brand-400 hover:text-white text-[10px] shrink-0 transition-colors"
              title="Sign out"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
