// HRMS module — permission keys.
// Namespaced `hrms.<area>.<action>`; RLS + has_perm() in the DB are authoritative,
// these keys drive UI affordance (useCan) for the HRMS surface.
export const HRMS_PERMISSIONS = [
  // Org / policy configuration (masters + HR policy settings)
  'hrms.config.manage',
  // Employee master
  'hrms.employee.view',
  'hrms.employee.manage',
  // Self-service (an employee viewing their own record)
  'hrms.employee.view.self',
  // Sensitive PII (bank, statutory IDs, medical)
  'hrms.employee.sensitive.view',
  // Attendance (M2) — self-service, view (team/all), correct, approve; shift admin
  'hrms.attendance.self',
  'hrms.attendance.view',
  'hrms.attendance.manage',
  'hrms.attendance.approve',
  'hrms.shift.manage',
  // Leave (M3) — self-service apply/cancel, view (team/all), approve, and manage
  // (leave types, holidays, balances, encashments).
  'hrms.leave.apply',
  'hrms.leave.view',
  'hrms.leave.approve',
  'hrms.leave.manage',
  // Payroll (M4) — salary confidential (view/manage), payroll run process vs approve
  // (segregation of duties), payroll view, and self-service payslip.
  'hrms.salary.view',
  'hrms.salary.manage',
  'hrms.payroll.process',
  'hrms.payroll.approve',
  'hrms.payroll.view',
  'hrms.payslip.self',
] as const

export type HrmsPermission = (typeof HRMS_PERMISSIONS)[number]
