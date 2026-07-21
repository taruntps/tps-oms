// HRMS module — public API.
// The only surface other layers (registry, App) may import from this module.
// Composes the HRMS nav group, routes, and the hrms.* permission keys.
import type { ModuleDef } from '@/core/moduleTypes'
import { hrmsNav } from './nav'
import { hrmsRoutes } from './routes'
import { HRMS_PERMISSIONS } from './permissions'

export const hrmsModule: ModuleDef = {
  key: 'hrms',
  nav: hrmsNav,
  routes: hrmsRoutes,
  permissions: [...HRMS_PERMISSIONS],
}

export { hrmsNav, hrmsRoutes, HRMS_PERMISSIONS }
