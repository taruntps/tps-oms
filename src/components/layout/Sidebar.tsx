import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { Sym } from '@/components/shared/Sym'
import { useNotifications } from '@/hooks/useNotifications'
import type { UserRole } from '@/types'

interface NavItem {
  href: string
  label: string
  icon: string // Material Symbols ligature name
  roles: UserRole[]
}

const NAV: NavItem[] = [
  { href: '/dashboard',          label: 'My Dashboard',   icon: 'dashboard',               roles: ['super_admin','director','manager','executive','accounts','hr','auditor'] },
  { href: '/attendance',         label: 'Attendance',     icon: 'fingerprint',             roles: ['super_admin','director','manager','executive','accounts','hr','auditor'] },
  { href: '/tasks',              label: 'Tasks',          icon: 'task_alt',                roles: ['super_admin','director','manager','executive','accounts','hr','auditor'] },
  { href: '/notifications',      label: 'Notifications',  icon: 'notifications',           roles: ['super_admin','director','manager','executive','accounts','hr','auditor'] },
  { href: '/director',           label: 'Director View',  icon: 'trending_up',             roles: ['super_admin','director'] },
  { href: '/operations',         label: 'Operations',     icon: 'shield',                  roles: ['super_admin','director','manager','executive','accounts','hr','auditor'] },
  { href: '/clients',            label: 'Clients',        icon: 'apartment',               roles: ['super_admin','director','manager','executive','accounts','auditor'] },
  { href: '/referrals',          label: 'Referrals',      icon: 'handshake',               roles: ['super_admin','director','manager'] },
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
  const { unreadCount } = useNotifications()

  return (
    <aside className="w-60 min-h-screen glass-panel border-r-0 flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-lg overflow-hidden p-1">
            <img src="/logo.png" alt="TPS" className="w-full h-full object-contain" />
          </div>
          <div>
            <p className="text-white font-display font-semibold text-sm leading-tight">TPS Xperts Portal</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {/* While profile is still loading, show placeholder bars so the nav column
            never appears empty — prevents a CLS flash as items appear. */}
        {!role && [1,2,3,4,5,6].map(i => (
          <div key={i} className="h-9 rounded-xl bg-white/8 animate-pulse mx-0.5" />
        ))}
        {role && NAV.filter(item => item.roles.includes(role)).map(item => (
          <NavLink
            key={item.href}
            to={item.href}
            className={({ isActive }) => cn(
              // Use relative + shadow-inset-r instead of border-r-4 so the active
              // indicator does NOT consume content width (which caused "Knowledge Base"
              // to wrap onto a second line and every nav item to shift 4px on activation).
              'relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all group',
              isActive
                ? 'bg-white/20 text-white font-medium'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            )}
          >
            {({ isActive }) => (
              <>
                {/* Active indicator bar — absolutely positioned so it never shifts content width */}
                {isActive && (
                  <span className="absolute right-0 top-1.5 bottom-1.5 w-1 rounded-l-full bg-white" />
                )}
                <Sym name={item.icon} size={18} fill={isActive} className="shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.href === '/notifications' && unreadCount > 0 && (
                  <span className="text-[9px] bg-red-500 text-white rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center font-bold shrink-0">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
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
