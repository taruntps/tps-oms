// Administration — Roles & Permissions React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import {
  fetchRoles,
  fetchPermissions,
  fetchRolePermissions,
  grantRolePermission,
  revokeRolePermission,
  type Scope,
} from '../api/roles'

const ROLES_KEY = ['admin', 'roles']
const PERMS_KEY = ['admin', 'permissions']
const ROLE_PERMS_KEY = ['admin', 'role-permissions']

export function useRoles() {
  return useQuery({ queryKey: ROLES_KEY, queryFn: fetchRoles, staleTime: 5 * 60_000 })
}

export function usePermissions() {
  return useQuery({ queryKey: PERMS_KEY, queryFn: fetchPermissions, staleTime: 5 * 60_000 })
}

export function useRolePermissions() {
  return useQuery({ queryKey: ROLE_PERMS_KEY, queryFn: fetchRolePermissions })
}

/** Toggle a permission grant for a base role, invalidating the matrix on success. */
export function useToggleRolePermission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { role_key: string; perm_key: string; granted: boolean; scope?: Scope }) => {
      if (args.granted) {
        await revokeRolePermission(args.role_key, args.perm_key)
      } else {
        await grantRolePermission(args.role_key, args.perm_key, args.scope ?? 'all')
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ROLE_PERMS_KEY })
      toast.success('Permissions updated')
    },
    onError: (e: Error) => toast.error('Failed', e.message),
  })
}
