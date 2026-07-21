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

  it('mounts the M1 employee + M2 attendance routes', () => {
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
