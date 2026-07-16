// Operations module — public API.
// The only surface other layers (registry, App) may import from this module.
import type { ModuleDef } from '@/core/moduleTypes'
import { operationsNav } from './nav'
import { operationsRoutes } from './routes'
import { OPERATIONS_PERMISSIONS } from './permissions'

export const operationsModule: ModuleDef = {
  key: 'operations',
  nav: operationsNav,
  routes: operationsRoutes,
  permissions: [...OPERATIONS_PERMISSIONS],
}

export { operationsNav, operationsRoutes, OPERATIONS_PERMISSIONS }
