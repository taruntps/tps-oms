// HRMS module — sidebar nav entries.
// An "HRMS" group surfacing the Employee master, org setup masters, and HR policy
// settings. Gated to the people-ops roles; the registry filters entries by role.
import type { NavEntry } from '@/core/moduleTypes'

const HRMS_ROLES = ['super_admin', 'director', 'manager', 'hr', 'auditor']
// Self-service (My Attendance) is also open to individual-contributor roles.
const HRMS_SELF_ROLES = [...HRMS_ROLES, 'executive', 'accounts']
// Profile-approval admins — must match review_profile_change's role guard (migration 104).
const HRMS_PROFILE_ADMIN_ROLES = ['super_admin', 'director', 'hr']

export const hrmsNav: NavEntry[] = [
  // ── Employee Self-Service hub (M9) — first entry, open to every role ──
  {
    to: '/hrms/me',
    label: 'My Hub',
    icon: 'dashboard',
    roles: HRMS_SELF_ROLES,
    permission: 'hrms.ess.view',
  },
  {
    to: '/hrms/profile',
    label: 'My Profile',
    icon: 'contact_page',
    roles: HRMS_SELF_ROLES,
    permission: 'hrms.ess.view',
  },
  {
    to: '/hrms/profile/approvals',
    label: 'Profile Approvals',
    icon: 'how_to_reg',
    roles: HRMS_PROFILE_ADMIN_ROLES,
    permission: 'hrms.employee.view',
  },
  {
    to: '/hrms/dashboard',
    label: 'HR Dashboard',
    icon: 'monitoring',
    roles: HRMS_ROLES,
    permission: 'hrms.dashboard.view',
  },
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
  // ── Leave (M3) ──
  {
    to: '/hrms/leave/me',
    label: 'My Leave',
    icon: 'beach_access',
    roles: HRMS_SELF_ROLES,
    permission: 'hrms.leave.apply',
  },
  {
    to: '/hrms/short-leave',
    label: 'Short Leave',
    icon: 'hourglass_bottom',
    roles: HRMS_SELF_ROLES,
    permission: 'hrms.ess.view',
  },
  {
    to: '/hrms/holidays',
    label: 'Holidays',
    icon: 'celebration',
    roles: HRMS_SELF_ROLES,
    permission: 'hrms.ess.view',
  },
  {
    to: '/hrms/policy',
    label: 'Leave Policy',
    icon: 'menu_book',
    roles: HRMS_SELF_ROLES,
    permission: 'hrms.ess.view',
  },
  {
    to: '/hrms/leave',
    label: 'Leave',
    icon: 'event_available',
    roles: HRMS_ROLES,
    permission: 'hrms.leave.view',
  },
  {
    to: '/hrms/leave/approvals',
    label: 'Leave Approvals',
    icon: 'how_to_reg',
    roles: HRMS_ROLES,
    permission: 'hrms.leave.approve',
  },
  {
    to: '/hrms/short-leave/approvals',
    label: 'Short Leave Approvals',
    icon: 'hourglass_top',
    roles: HRMS_ROLES,
    permission: 'hrms.leave.approve',
  },
  {
    to: '/hrms/leave/setup',
    label: 'Leave Setup',
    icon: 'event_note',
    roles: HRMS_ROLES,
    permission: 'hrms.leave.manage',
  },
  // Attendance-status master (M3 configurability enhancement).
  {
    to: '/hrms/setup/attendance-status',
    label: 'Attendance Status',
    icon: 'rule',
    roles: HRMS_ROLES,
    permission: 'hrms.config.manage',
  },
  // ── Payroll (M4) ──
  {
    to: '/hrms/payroll/structures',
    label: 'Salary Structures',
    icon: 'payments',
    roles: HRMS_ROLES,
    permission: 'hrms.salary.view',
  },
  {
    to: '/hrms/payroll/runs',
    label: 'Payroll Runs',
    icon: 'receipt_long',
    roles: HRMS_ROLES,
    permission: 'hrms.payroll.view',
  },
  {
    to: '/hrms/payroll/payslips',
    label: 'Payslips',
    icon: 'description',
    roles: HRMS_SELF_ROLES,
    permission: 'hrms.payslip.self',
  },
  {
    to: '/hrms/payroll/components',
    label: 'Salary Components',
    icon: 'tune',
    roles: HRMS_ROLES,
    permission: 'hrms.salary.manage',
  },
  {
    to: '/hrms/payroll/statutory',
    label: 'Statutory Config',
    icon: 'gavel',
    roles: HRMS_ROLES,
    permission: 'hrms.salary.manage',
  },
  // ── Recruitment (M5) ──
  {
    to: '/hrms/recruit/requisitions',
    label: 'Requisitions',
    icon: 'work',
    roles: HRMS_ROLES,
    permission: 'hrms.recruitment.manage',
  },
  {
    to: '/hrms/recruit/candidates',
    label: 'Candidates',
    icon: 'groups',
    roles: HRMS_ROLES,
    permission: 'hrms.recruitment.manage',
  },
  // ── Lifecycle (M5) ──
  {
    to: '/hrms/lifecycle/onboarding',
    label: 'Onboarding',
    icon: 'checklist',
    roles: HRMS_ROLES,
    permission: 'hrms.onboarding.manage',
  },
  {
    to: '/hrms/lifecycle',
    label: 'Lifecycle',
    icon: 'manage_accounts',
    roles: HRMS_ROLES,
    permission: 'hrms.lifecycle.manage',
  },
  {
    to: '/hrms/lifecycle/separations',
    label: 'Separations',
    icon: 'logout',
    roles: HRMS_ROLES,
    permission: 'hrms.lifecycle.manage',
  },
  // ── Performance (M6) ──
  {
    to: '/hrms/performance/me',
    label: 'My Performance',
    icon: 'star',
    roles: HRMS_SELF_ROLES,
    permission: 'hrms.performance.review.self',
  },
  {
    to: '/hrms/performance',
    label: 'Performance',
    icon: 'insights',
    roles: HRMS_ROLES,
    permission: 'hrms.performance.view',
  },
  {
    to: '/hrms/performance/cycles',
    label: 'Cycles',
    icon: 'event_repeat',
    roles: HRMS_ROLES,
    permission: 'hrms.performance.manage',
  },
  {
    to: '/hrms/performance/reports',
    label: 'Reports',
    icon: 'bar_chart',
    roles: HRMS_ROLES,
    permission: 'hrms.performance.view',
  },
  { to: '/hrms/training', label: 'Training', icon: 'school', roles: HRMS_ROLES, permission: 'hrms.training.view' },
  { to: '/hrms/training/certifications', label: 'Certifications', icon: 'verified', roles: HRMS_ROLES, permission: 'hrms.training.view' },
  { to: '/hrms/training/me', label: 'My Training', icon: 'cast_for_education', roles: [...HRMS_ROLES, 'executive', 'accounts'], permission: 'hrms.training.view.self' },
  // ── Assets (M8) ──
  { to: '/hrms/assets', label: 'Asset Register', icon: 'devices', roles: HRMS_ROLES, permission: 'hrms.asset.manage' },
  { to: '/hrms/assets/me', label: 'My Assets', icon: 'laptop_mac', roles: HRMS_SELF_ROLES, permission: 'hrms.asset.view.self' },
]
