// Sales module — public API.
// The only surface other layers (registry, App) may import from this module.
// Composes the sales nav group, routes, and the sales.* permission keys.
// To activate: add `salesModule` to MODULES in src/core/registry.ts.
import type { ModuleDef } from '@/core/moduleTypes'
import { salesNav } from './nav'
import { salesRoutes } from './routes'
import { SALES_PERMISSIONS } from './permissions'

export const salesModule: ModuleDef = {
  key: 'sales',
  nav: salesNav,
  routes: salesRoutes,
  permissions: [...SALES_PERMISSIONS],
}

export { salesNav, salesRoutes, SALES_PERMISSIONS }
