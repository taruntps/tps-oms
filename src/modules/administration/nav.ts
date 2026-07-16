// Administration module — sidebar nav entries.
// An "Administration" group surfacing both existing pages (Users, Settings) and
// the new admin surfaces (Roles, Audit, Privacy). Gated to super_admin/director;
// the registry filters by the current user's role (see core/registry.ts).
import type { NavEntry } from '@/core/moduleTypes'

const ADMIN_ROLES = ['super_admin', 'director']

export const administrationNav: NavEntry[] = [
  {
    to: '/admin/users',
    label: 'Users',
    icon: 'admin_panel_settings',
    roles: ADMIN_ROLES,
    permission: 'admin.user.manage',
  },
  {
    to: '/admin/roles',
    label: 'Roles & Permissions',
    icon: 'shield',
    roles: ADMIN_ROLES,
    permission: 'admin.role.manage',
  },
  {
    to: '/admin/audit',
    label: 'Audit Log',
    icon: 'history',
    roles: ADMIN_ROLES,
    permission: 'admin.audit.view',
  },
  {
    to: '/admin/privacy',
    label: 'Privacy',
    icon: 'privacy_tip',
    roles: ADMIN_ROLES,
    permission: 'admin.privacy.manage',
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: 'settings',
    roles: ADMIN_ROLES,
  },
]
