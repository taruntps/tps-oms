import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { Sym } from '@/components/shared/Sym'
import type { UserRole } from '@/types'

interface NavItem {
  href: string
  label: string
  icon: string // Material Symbols ligature name
  roles: UserRole[]
}

const NAV: NavItem[] = [
  { href: '/dashboard',          label: 'My Dashboard',   icon: 'dashboard',               roles: ['super_admin','director','manager','executive','accounts','hr','auditor'] },
  { href: '/director',           label: 'Director View',  icon: 'trending_up',             roles: ['super_admin','director'] },
  { href: '/operations',         label: 'Operations',     icon: 'shield',                  roles: ['super_admin','director','manager'] },
  { href: '/clients',            label: 'Clients',        icon: 'apartment',               roles: ['super_admin','director','manager','executive','accounts','auditor'] },
  { href: '/projects',           label: 'Projects',       icon: 'assignment',              roles: ['super_admin','director','manager','executive'] },
  { href: '/employees',          label: 'Employees',      icon: 'badge',                   roles: ['super_admin','director','manager','hr'] },
  { href: '/knowledge',          label: 'Knowledge Base', icon: 'menu_book',               roles: ['super_admin','director','manager','executive','auditor'] },
  { href: '/reports/performance',label: 'Reports',        icon: 'bar_chart',               roles: ['super_admin','director','manager'] },
  { href: '/settings',           label: 'Settings',       icon: 'settings',                roles: ['super_admin'] },
  { href: '/admin/users',        label: 'User Management',icon: 'admin_panel_settings',    roles: ['super_admin','director'] },
]

export function Sidebar() {
  const { profile, signOut } = useAuth()
  const role = profile?.role as UserRole | undefined

  return (
    <aside className="w-60 min-h-screen glass-panel border-r-0 flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/95 flex items-center justify-center shrink-0 shadow-lg overflow-hidden p-0.5">
            <img src="/logo.png" alt="TPS" className="w-full h-full object-contain" />
          </div>
          <div>
            <p className="text-white font-display font-semibold text-sm leading-tight">TPS Operations</p>
            <p className="text-white/55 text-[10px] font-mono mt-0.5">portal.tpsxpert.com</p>
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
              'flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all group',
              isActive
                ? 'bg-white/20 text-white font-medium border-r-4 border-white'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            )}
          >
            {({ isActive }) => (
              <>
                <Sym name={item.icon} size={18} fill={isActive} className="shrink-0" />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      {profile && (
        <div className="px-3 py-3 border-t border-white/10">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">
                {profile.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{profile.name}</p>
              <p className="text-white/55 text-[10px] capitalize">{profile.role.replace('_', ' ')}</p>
            </div>
            <button
              onClick={signOut}
              className="text-white/60 hover:text-white text-[10px] shrink-0 transition-colors"
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
