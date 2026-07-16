// Administration — Roles & Permissions data access (thin supabase wrappers).
// Tables: roles, permissions, role_permissions (migration 078/081). Most of these
// are not in the generated Database types yet, so we cast `from(...)` to `any`
// (matching the established pattern in src/pages/admin/UserManagementPage.tsx).
import { supabase } from '@/lib/supabase'

const db = supabase as any

export type Scope = 'own' | 'team' | 'all'

export interface RoleRow {
  role_key: string
  label: string | null
  role_type: string | null
  maps_to_base: string | null
  sort_order: number | null
}

export interface PermissionRow {
  perm_key: string
  module: string | null
  label: string | null
}

export interface RolePermissionRow {
  role_key: string
  perm_key: string
  scope: Scope
}

export async function fetchRoles(): Promise<RoleRow[]> {
  const { data, error } = await db.from('roles')
    .select('role_key, label, role_type, maps_to_base, sort_order')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as RoleRow[]
}

export async function fetchPermissions(): Promise<PermissionRow[]> {
  const { data, error } = await db.from('permissions')
    .select('perm_key, module, label')
    .order('module', { ascending: true })
    .order('perm_key', { ascending: true })
  if (error) throw error
  return (data ?? []) as PermissionRow[]
}

export async function fetchRolePermissions(): Promise<RolePermissionRow[]> {
  const { data, error } = await db.from('role_permissions')
    .select('role_key, perm_key, scope')
  if (error) throw error
  return (data ?? []) as RolePermissionRow[]
}

/** Grant a permission to a base role (default scope 'all'). */
export async function grantRolePermission(
  role_key: string,
  perm_key: string,
  scope: Scope = 'all',
): Promise<void> {
  const { error } = await db.from('role_permissions')
    .insert({ role_key, perm_key, scope })
  if (error) throw error
}

/** Revoke a permission from a base role. */
export async function revokeRolePermission(role_key: string, perm_key: string): Promise<void> {
  const { error } = await db.from('role_permissions')
    .delete()
    .eq('role_key', role_key)
    .eq('perm_key', perm_key)
  if (error) throw error
}
