// HRMS M1 — module contract unit tests.
// Guards the Employee Master module's public surface: stable key, the five permission
// keys, the four routes, and the nav group. Cheap, deterministic, no network.
import { describe, it, expect } from 'vitest'
import { hrmsModule, HRMS_PERMISSIONS, hrmsNav, hrmsRoutes } from './index'

describe('hrmsModule contract (M1 Employee Master)', () => {
  it('registers under the stable "hrms" key', () => {
    expect(hrmsModule.key).toBe('hrms')
  })

  it('defines exactly the five HRMS permission keys', () => {
    expect(hrmsModule.permissions).toEqual([...HRMS_PERMISSIONS])
    expect([...HRMS_PERMISSIONS].sort()).toEqual(
      [
        'hrms.config.manage',
        'hrms.employee.manage',
        'hrms.employee.sensitive.view',
        'hrms.employee.view',
        'hrms.employee.view.self',
      ].sort(),
    )
  })

  it('mounts the employee master, org setup and HR settings routes', () => {
    const paths = hrmsRoutes.map((r) => r.path)
    expect(paths).toContain('hrms/employees')
    expect(paths).toContain('hrms/employees/:id')
    expect(paths).toContain('hrms/setup/org')
    expect(paths).toContain('hrms/setup/policies')
    expect(hrmsRoutes.length).toBe(4)
  })

  it('exposes an HRMS nav group gated to people-ops roles', () => {
    expect(hrmsNav.length).toBeGreaterThanOrEqual(3)
    const employees = hrmsNav.find((n) => n.to === '/hrms/employees')
    expect(employees?.permission).toBe('hrms.employee.view')
    // config screens require the config permission
    const orgSetup = hrmsNav.find((n) => n.to === '/hrms/setup/org')
    expect(orgSetup?.permission).toBe('hrms.config.manage')
  })
})
