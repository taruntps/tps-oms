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
] as const

export type HrmsPermission = (typeof HRMS_PERMISSIONS)[number]
