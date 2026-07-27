// App shell — sidebar navigation (PR1 UI/Nav Modernization).
// Registry-driven + grouped: renders getNavFor(role) organised into collapsible
// enterprise groups (Dashboard / Business / Finance / HRMS / Documents / Reports /
// Administration) via core/navGroups. Replaces the previous hard-coded flat NAV
// (which ignored the module registry and duplicated HRMS/Attendance/Employees).
// Permission-gated entries are filtered by the user's effective permissions.
import { useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { Sym } from '@/components/shared/Sym'
import { useNotifications } from '@/hooks/useNotifications'
import { getNavFor } from '@/core/registry'
import { groupNav, DEFAULT_COLLAPSED, type NavGroup } from '@/core/navGroups'
import { useMyPermissions } from '@/core/access/useCan'
import type { UserRole } from '@/types'

export function Sidebar() {
  const { profile, signOut } = useAuth()
  const role = profile?.role as UserRole | undefined
  const { unreadCount } = useNotifications()
  const { data: perms } = useMyPermissions()

  // Role-visible entries, then permission-gate (fail-closed while perms load, mirroring useCan).
  const grouped = useMemo(() => {
    const visible = getNavFor(role).filter((e) => !e.permission || (perms ? e.permission in perms : false))
    return groupNav(visible)
  }, [role, perms])

  const [collapsed, setCollapsed] = useState<Set<NavGroup>>(() => new Set(DEFAULT_COLLAPSED))
  const toggle = (g: NavGroup) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g); else next.add(g)
      return next
    })

  return (
    <aside className="w-60 h-screen glass-panel border-r-0 flex flex-col shrink-0">
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
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {!role &&
          [1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-9 rounded-xl bg-white/8 animate-pulse mx-0.5 mb-1" />)}

        {role &&
          grouped.map(({ group, items }) => {
            const isCollapsed = collapsed.has(group)
            return (
              <div key={group} className="mb-1.5">
                <button
                  onClick={() => toggle(group)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/45 hover:text-white/70 transition-colors"
                >
                  <span>{group}</span>
                  <Sym name={isCollapsed ? 'chevron_right' : 'expand_more'} size={15} className="shrink-0" />
                </button>
                {!isCollapsed && (
                  <div className="space-y-0.5">
                    {items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/dashboard'}
                        className={({ isActive }) =>
                          cn(
                            'relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all group',
                            isActive ? 'bg-white/20 text-white font-medium' : 'text-white/70 hover:bg-white/10 hover:text-white',
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && <span className="absolute right-0 top-1.5 bottom-1.5 w-1 rounded-l-full bg-white" />}
                            <Sym name={item.icon} size={18} fill={isActive} className="shrink-0" />
                            <span className="flex-1 truncate">{item.label}</span>
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
      </nav>

      {/* User footer */}
      {profile && (
        <div className="px-3 py-3 border-t border-white/10">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">
                {profile.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{profile.name}</p>
              <p className="text-white/55 text-[10px] capitalize">{profile.role.replace('_', ' ')}</p>
            </div>
            <NavLink
              to="/notifications"
              className="relative text-white/60 hover:text-white shrink-0 transition-colors"
              title="Notifications"
            >
              <Sym name="notifications" size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 text-[9px] bg-red-500 text-white rounded-full min-w-[15px] h-[15px] px-1 flex items-center justify-center font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </NavLink>
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
