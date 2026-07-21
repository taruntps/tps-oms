// HRMS module — sidebar nav entries.
// An "HRMS" group surfacing the Employee master, org setup masters, and HR policy
// settings. Gated to the people-ops roles; the registry filters entries by role.
import type { NavEntry } from '@/core/moduleTypes'

const HRMS_ROLES = ['super_admin', 'director', 'manager', 'hr', 'auditor']
// Self-service (My Attendance) is also open to individual-contributor roles.
const HRMS_SELF_ROLES = [...HRMS_ROLES, 'executive', 'accounts']

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
  // ── Attendance (M2) ──
  {
    to: '/hrms/attendance/me',
    label: 'My Attendance',
    icon: 'schedule',
    roles: HRMS_SELF_ROLES,
    permission: 'hrms.attendance.self',
  },
  {
    to: '/hrms/attendance',
    label: 'Attendance',
    icon: 'fact_check',
    roles: HRMS_ROLES,
    permission: 'hrms.attendance.view',
  },
  {
    to: '/hrms/attendance/approvals',
    label: 'Approvals',
    icon: 'approval',
    roles: HRMS_ROLES,
    permission: 'hrms.attendance.approve',
  },
  {
    to: '/hrms/attendance/shifts',
    label: 'Shifts',
    icon: 'alarm',
    roles: HRMS_ROLES,
    permission: 'hrms.shift.manage',
  },
]
