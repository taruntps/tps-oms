// Central route-level permission gate. The nav already hides pages a user can't see;
// this stops a denied page being reached by typing the URL. Built from the nav registry
// (path → permission). FAIL-OPEN by design: unknown routes, or while permissions load,
// render normally — it only redirects when we positively know the user lacks the
// permission. (Sensitive data is additionally protected by RLS.)
import { useMemo } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useMyPermissions } from '@/core/access/useCan'
import { coreNav } from '@/core/coreNav'
import { MODULES } from '@/core/registry'

const ROUTE_PERMS: { to: string; perm: string }[] = [...coreNav, ...MODULES.flatMap(m => m.nav)]
  .filter(e => !!e.permission)
  .map(e => ({ to: e.to, perm: e.permission as string }))
  .sort((a, b) => b.to.length - a.to.length) // longest path first for prefix matching

function requiredPerm(pathname: string): string | null {
  const hit = ROUTE_PERMS.find(r => pathname === r.to || pathname.startsWith(r.to + '/'))
  return hit ? hit.perm : null
}

export function RoutePermissionGuard() {
  const { pathname } = useLocation()
  const { data: perms, isLoading } = useMyPermissions()
  const perm = useMemo(() => requiredPerm(pathname), [pathname])

  if (perm && !isLoading && perms && !perms[perm]) {
    return <Navigate to="/dashboard" replace />
  }
  return <Outlet />
}
