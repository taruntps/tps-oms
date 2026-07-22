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
  // Recruitment & Employee Lifecycle (M5) — internal recruitment (requisitions,
  // candidates, interviews, offers), onboarding checklists, and lifecycle
  // (confirmation/transfer/promotion status events + separations & F&F).
  'hrms.recruitment.manage',
  'hrms.recruitment.approve',
  'hrms.recruitment.interview',
  'hrms.onboarding.manage',
  'hrms.lifecycle.manage',
  'hrms.lifecycle.approve',
  // Performance Management (M6) — review cycles, goals (KRA/KPI), single-level reviews
  // (self / manager / calibration / final), and increment/promotion recommendations.
  // `manage` runs cycles/goals/calibration; `review.self`/`review.manager` gate the
  // respective review stages; `view` is read/report access; `recommend.approve` decides
  // raised increment/promotion recommendations.
  'hrms.performance.manage',
  'hrms.performance.review.self',
  'hrms.performance.review.manager',
  'hrms.performance.view',
  'hrms.performance.recommend.approve',
  // M7 Training
  'hrms.training.manage',
  'hrms.training.view',
  'hrms.training.view.self',
  // M8 Assets
  'hrms.asset.manage',
  'hrms.asset.view.self',
] as const

export type HrmsPermission = (typeof HRMS_PERMISSIONS)[number]
