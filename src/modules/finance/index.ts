// Finance & Accounts module — public API.
// The only surface other layers (registry, App) may import from this module.
// Composes the finance nav group, routes, and the finance.* permission keys.
// To activate: add `financeModule` to MODULES in src/core/registry.ts.
import type { ModuleDef } from '@/core/moduleTypes'
import { financeNav } from './nav'
import { financeRoutes } from './routes'
import { FINANCE_PERMISSIONS } from './permissions'

export const financeModule: ModuleDef = {
  key: 'finance',
  nav: financeNav,
  routes: financeRoutes,
  permissions: [...FINANCE_PERMISSIONS],
}

export { financeNav, financeRoutes, FINANCE_PERMISSIONS }
