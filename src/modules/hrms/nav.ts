// HRMS module — sidebar nav entries.
// An "HRMS" group surfacing the Employee master, org setup masters, and HR policy
// settings. Gated to the people-ops roles; the registry filters entries by role.
import type { NavEntry } from '@/core/moduleTypes'

const HRMS_ROLES = ['super_admin', 'director', 'manager', 'hr', 'auditor']

export const hrmsNav: NavEntry[] = [
  {
    to: '/hrms/employees',
    label: 'Employees',
    icon: 'badge',
    roles: HRMS_ROLES,
    permission: 'hrms.employee.view',
  },
  {
    to: '/hrms/setup/org',
    label: 'Org Setup',
    icon: 'account_tree',
    roles: HRMS_ROLES,
    permission: 'hrms.config.manage',
  },
  {
    to: '/hrms/setup/policies',
    label: 'HR Settings',
    icon: 'tune',
    roles: HRMS_ROLES,
    permission: 'hrms.config.manage',
  },
]
