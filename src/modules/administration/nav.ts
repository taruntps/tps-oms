// Administration module — sidebar nav entries.
// An "Administration" group surfacing both existing pages (Users, Settings) and
// the new admin surfaces (Roles, Audit, Privacy). Gated purely by permission so the
// Manage Access panel can control visibility per employee (permissions are granted
// only to super_admin/director by default — plus admin.audit.view to manager).
import type { NavEntry } from '@/core/moduleTypes'

export const administrationNav: NavEntry[] = [
  {
    to: '/admin/users',
    label: 'Users',
    icon: 'admin_panel_settings',
    permission: 'admin.user.manage',
  },
  {
    to: '/admin/roles',
    label: 'Roles & Permissions',
    icon: 'shield',
    permission: 'admin.role.manage',
  },
  {
    to: '/admin/audit',
    label: 'Audit Log',
    icon: 'history',
    permission: 'admin.audit.view',
  },
  {
    to: '/admin/privacy',
    label: 'Privacy',
    icon: 'privacy_tip',
    permission: 'admin.privacy.manage',
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: 'settings',
    permission: 'admin.settings.view',
  },
]
