// Administration module — permission keys.
// Namespaced `admin.<entity>.<action>`; RLS + has_perm() in the DB are
// authoritative, these keys drive UI affordance (useCan) for the admin surface.
export const ADMIN_PERMISSIONS = [
  // Users (existing UserManagementPage)
  'admin.user.manage',
  // Roles & permissions matrix
  'admin.role.manage',
  // Audit log viewer
  'admin.audit.view',
  // Privacy / DPDP (consent + data-subject requests)
  'admin.privacy.manage',
] as const

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number]
