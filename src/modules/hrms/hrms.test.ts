// HRMS module — contract unit tests (M1 Employee Master + M2 Attendance).
// Guards the module's public surface: stable key, permission keys, routes, nav gating.
// Cheap, deterministic, no network.
import { describe, it, expect } from 'vitest'
import { hrmsModule, HRMS_PERMISSIONS, hrmsNav, hrmsRoutes } from './index'

describe('hrmsModule contract', () => {
  it('registers under the stable "hrms" key', () => {
    expect(hrmsModule.key).toBe('hrms')
  })

  it('M1 — defines the employee-master + config permission keys', () => {
    for (const k of [
      'hrms.config.manage',
      'hrms.employee.view',
      'hrms.employee.manage',
      'hrms.employee.view.self',
      'hrms.employee.sensitive.view',
    ]) {
      expect(HRMS_PERMISSIONS).toContain(k)
    }
  })

  it('M2 — defines the attendance + shift permission keys', () => {
    for (const k of [
      'hrms.attendance.self',
      'hrms.attendance.view',
      'hrms.attendance.manage',
      'hrms.attendance.approve',
      'hrms.shift.manage',
    ]) {
      expect(HRMS_PERMISSIONS).toContain(k)
    }
    expect(hrmsModule.permissions).toEqual([...HRMS_PERMISSIONS])
    // keys are unique
    expect(new Set(HRMS_PERMISSIONS).size).toBe(HRMS_PERMISSIONS.length)
  })

  it('M3 — defines the leave permission keys', () => {
    for (const k of ['hrms.leave.apply', 'hrms.leave.view', 'hrms.leave.approve', 'hrms.leave.manage']) {
      expect(HRMS_PERMISSIONS).toContain(k)
    }
  })

  it('M4 — defines the salary + payroll + payslip permission keys', () => {
    for (const k of [
      'hrms.salary.view',
      'hrms.salary.manage',
      'hrms.payroll.process',
      'hrms.payroll.approve',
      'hrms.payroll.view',
      'hrms.payslip.self',
    ]) {
      expect(HRMS_PERMISSIONS).toContain(k)
    }
    // keys remain unique
    expect(new Set(HRMS_PERMISSIONS).size).toBe(HRMS_PERMISSIONS.length)
  })

  it('M4 — mounts the payroll routes', () => {
    const paths = hrmsRoutes.map((r) => r.path)
    for (const p of [
      'hrms/payroll/components',
      'hrms/payroll/structures',
      'hrms/payroll/statutory',
      'hrms/payroll/runs',
      'hrms/payroll/runs/:id',
      'hrms/payroll/payslips',
    ]) {
      expect(paths).toContain(p)
    }
  })

  it('M5 — defines recruitment + lifecycle permission keys and routes', () => {
    for (const k of [
      'hrms.recruitment.manage', 'hrms.recruitment.approve', 'hrms.recruitment.interview',
      'hrms.onboarding.manage', 'hrms.lifecycle.manage', 'hrms.lifecycle.approve',
    ]) expect(HRMS_PERMISSIONS).toContain(k)
    const paths = hrmsRoutes.map((r) => r.path)
    for (const p of ['hrms/recruit/requisitions', 'hrms/recruit/candidates', 'hrms/recruit/candidates/:id', 'hrms/lifecycle', 'hrms/lifecycle/onboarding', 'hrms/lifecycle/separations'])
      expect(paths).toContain(p)
  })

  it('M6 — defines performance permission keys and routes', () => {
    for (const k of [
      'hrms.performance.manage',
      'hrms.performance.review.self',
      'hrms.performance.review.manager',
      'hrms.performance.view',
      'hrms.performance.recommend.approve',
    ]) expect(HRMS_PERMISSIONS).toContain(k)
    const paths = hrmsRoutes.map((r) => r.path)
    for (const p of ['hrms/performance/me', 'hrms/performance', 'hrms/performance/cycles', 'hrms/performance/reports'])
      expect(paths).toContain(p)
    // keys remain unique
    expect(new Set(HRMS_PERMISSIONS).size).toBe(HRMS_PERMISSIONS.length)
  })

  it('mounts the M1 employee + M2 attendance + M3 leave routes', () => {
    const paths = hrmsRoutes.map((r) => r.path)
    // M1
    expect(paths).toContain('hrms/employees')
    expect(paths).toContain('hrms/employees/:id')
    expect(paths).toContain('hrms/setup/org')
    expect(paths).toContain('hrms/setup/policies')
    // M2
    expect(paths).toContain('hrms/attendance/me')
    expect(paths).toContain('hrms/attendance')
    expect(paths).toContain('hrms/attendance/approvals')
    expect(paths).toContain('hrms/attendance/shifts')
    expect(paths).toContain('hrms/attendance/reports')
    // M3
    expect(paths).toContain('hrms/leave/me')
    expect(paths).toContain('hrms/leave/approvals')
    expect(paths).toContain('hrms/leave/setup')
    expect(paths).toContain('hrms/setup/attendance-status')
    // no duplicate route paths
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('nav entries carry a permission gate', () => {
    expect(hrmsNav.length).toBeGreaterThanOrEqual(6)
    const myAtt = hrmsNav.find((n) => n.to === '/hrms/attendance/me')
    expect(myAtt?.permission).toBe('hrms.attendance.self')
    const shifts = hrmsNav.find((n) => n.to === '/hrms/attendance/shifts')
    expect(shifts?.permission).toBe('hrms.shift.manage')
  })
})
