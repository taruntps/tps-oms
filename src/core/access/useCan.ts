// Core Platform — Access: granular permission hook (Wave 1, ADDITIVE).
// Backs the new grant-based permission model (roles/user_roles/permissions/role_permissions +
// has_perm). Existing role guards (ProtectedRoute/RoleGuard/allowedRoles) keep working unchanged;
// useCan() is available for finer, assignable checks. super_admin is a hard floor server-side.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export type Scope = 'own' | 'team' | 'all'
const SCOPE_RANK: Record<Scope, number> = { own: 1, team: 2, all: 3 }

interface PermRow { perm_key: string; scope: Scope }

/** Fetches the current user's effective permissions once (cached 5 min). */
export function useMyPermissions() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my-permissions', user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      // my_permissions() (migration 081) isn't in the generated Database types yet.
      const { data, error } = await (supabase as any).rpc('my_permissions')
      if (error) throw error
      const map: Record<string, Scope> = {}
      for (const r of ((data ?? []) as PermRow[])) map[r.perm_key] = r.scope
      return map
    },
  })
}

/**
 * useCan('documents.doc.view') → boolean (does the user hold this permission at ≥ the
 * requested scope). Defaults to scope 'own' (the least — "can they at all").
 * While permissions load, returns false (fail-closed).
 */
export function useCan(permKey: string, scope: Scope = 'own'): boolean {
  const { data } = useMyPermissions()
  if (!data) return false
  const held = data[permKey]
  if (!held) return false
  return SCOPE_RANK[held] >= SCOPE_RANK[scope]
}

/** Returns a predicate for checking many keys without multiple hook calls. */
export function useCanFn() {
  const { data } = useMyPermissions()
  return (permKey: string, scope: Scope = 'own') => {
    if (!data) return false
    const held = data[permKey]
    return !!held && SCOPE_RANK[held] >= SCOPE_RANK[scope]
  }
}
