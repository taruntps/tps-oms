// Administration — Roles & Permissions matrix (/admin/roles).
// Rows = permissions, columns = base roles. Each cell shows the granted scope
// (own/team/all) or an empty state. super_admin / director may toggle a grant.
import { useMemo } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { cn } from '@/lib/utils'
import { useCan } from '@/core/access/useCan'
import { useAuth } from '@/contexts/AuthContext'
import { useRoles, usePermissions, useRolePermissions, useToggleRolePermission } from '../hooks/useRoles'
import type { Scope } from '../api/roles'

const SCOPE_BADGE: Record<Scope, string> = {
  own: 'bg-amber-50 border-amber-200 text-amber-700',
  team: 'bg-blue-50 border-blue-200 text-blue-700',
  all: 'bg-green-50 border-green-200 text-green-700',
}

export default function RolesPage() {
  const { profile } = useAuth()
  const canManageByPerm = useCan('admin.role.manage', 'all')
  // ProtectedRoute already restricts this route to super_admin/director; the role
  // check is the fallback when grant-based permissions aren't seeded for the user.
  const canManage = canManageByPerm || profile?.role === 'super_admin' || profile?.role === 'director'

  const rolesQ = useRoles()
  const permsQ = usePermissions()
  const rolePermsQ = useRolePermissions()
  const toggle = useToggleRolePermission()

  const isLoading = rolesQ.isLoading || permsQ.isLoading || rolePermsQ.isLoading
  const error = rolesQ.error || permsQ.error || rolePermsQ.error

  const roles = rolesQ.data ?? []
  const permissions = permsQ.data ?? []

  // Fast lookup: `${role_key}|${perm_key}` → scope
  const grantMap = useMemo(() => {
    const m = new Map<string, Scope>()
    for (const rp of rolePermsQ.data ?? []) m.set(`${rp.role_key}|${rp.perm_key}`, rp.scope)
    return m
  }, [rolePermsQ.data])

  // Group permission rows by module for readability.
  const groups = useMemo(() => {
    const g = new Map<string, typeof permissions>()
    for (const p of permissions) {
      const key = p.module ?? 'other'
      if (!g.has(key)) g.set(key, [])
      g.get(key)!.push(p)
    }
    return [...g.entries()]
  }, [permissions])

  return (
    <div>
      <TopBar title="Roles & Permissions" subtitle="Grant matrix — permissions × roles" />
      <div className="p-6 space-y-6 animate-fade-up">

        {error ? (
          <div className="glass-panel rounded-xl p-4 text-sm text-white">
            <div className="flex items-start gap-2">
              <Sym name="error" size={16} className="mt-0.5 shrink-0 text-red-300" />
              <div>
                <p className="font-medium mb-1">Couldn't load the permission matrix</p>
                <p className="text-xs text-white/70">{(error as Error).message}</p>
              </div>
            </div>
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-12 glass-panel rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-[#F8FAFC] border-b border-border">
                <tr>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide sticky left-0 bg-[#F8FAFC] z-10">
                    Permission
                  </th>
                  {roles.map(r => (
                    <th key={r.role_key} className="px-3 py-3 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                      {r.label ?? r.role_key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {groups.map(([moduleName, perms]) => (
                  <GroupRows
                    key={moduleName}
                    moduleName={moduleName}
                    perms={perms}
                    roles={roles}
                    grantMap={grantMap}
                    canManage={canManage}
                    pending={toggle.isPending}
                    onToggle={(role_key, perm_key, scope) =>
                      toggle.mutate({ role_key, perm_key, granted: scope != null })
                    }
                  />
                ))}
                {permissions.length === 0 && (
                  <tr>
                    <td colSpan={roles.length + 1} className="px-5 py-8 text-center text-sm text-muted-foreground">
                      No permissions defined yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="glass-panel rounded-xl p-4 text-sm text-white">
          <div className="flex items-start gap-2">
            <Sym name="shield" size={14} className="mt-0.5 shrink-0 text-primary-fixed-dim" />
            <div>
              <p className="font-medium mb-1">How grants work</p>
              <p className="text-xs text-white/70">
                A filled cell means the role holds that permission at the shown scope
                (<strong>own</strong> / <strong>team</strong> / <strong>all</strong>). New grants default to
                scope <strong>all</strong>. Row-Level Security in the database remains authoritative —
                this matrix drives UI affordance.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

function GroupRows({
  moduleName, perms, roles, grantMap, canManage, pending, onToggle,
}: {
  moduleName: string
  perms: { perm_key: string; module: string | null; label: string | null }[]
  roles: { role_key: string; label: string | null }[]
  grantMap: Map<string, Scope>
  canManage: boolean
  pending: boolean
  onToggle: (role_key: string, perm_key: string, scope: Scope | undefined) => void
}) {
  return (
    <>
      <tr className="bg-[#FBFCFE]">
        <td colSpan={roles.length + 1} className="px-5 py-1.5 text-[10px] font-semibold text-brand-700 uppercase tracking-wide sticky left-0 bg-[#FBFCFE]">
          {moduleName}
        </td>
      </tr>
      {perms.map(p => (
        <tr key={p.perm_key} className="hover:bg-[#F8FAFC]">
          <td className="px-5 py-2.5 sticky left-0 bg-white z-10">
            <p className="font-medium text-brand-950">{p.label ?? p.perm_key}</p>
            <p className="text-[10px] text-muted-foreground font-mono">{p.perm_key}</p>
          </td>
          {roles.map(r => {
            const scope = grantMap.get(`${r.role_key}|${p.perm_key}`)
            const granted = scope != null
            return (
              <td key={r.role_key} className="px-3 py-2.5 text-center">
                <button
                  type="button"
                  disabled={!canManage || pending}
                  onClick={() => onToggle(r.role_key, p.perm_key, scope)}
                  title={
                    granted
                      ? `Granted (${scope})${canManage ? ' — click to revoke' : ''}`
                      : canManage ? 'Click to grant (scope: all)' : 'Not granted'
                  }
                  className={cn(
                    'inline-flex items-center justify-center gap-1 min-w-[46px] text-[10px] font-medium px-2 py-1 rounded-full border transition-colors',
                    granted ? SCOPE_BADGE[scope!] : 'bg-gray-50 border-gray-200 text-gray-300',
                    canManage ? 'cursor-pointer hover:opacity-75' : 'cursor-default',
                  )}
                >
                  {granted
                    ? <><Sym name="check" size={11} /> {scope}</>
                    : <Sym name="remove" size={11} />}
                </button>
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
