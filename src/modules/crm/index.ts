// CRM module — public API.
// The only surface other layers (registry, App) may import from this module.
// Composes the CRM nav group, routes, and the crm.* permission keys.
import type { ModuleDef } from '@/core/moduleTypes'
import { crmNav } from './nav'
import { crmRoutes } from './routes'
import { CRM_PERMISSIONS } from './permissions'

export const crmModule: ModuleDef = {
  key: 'crm',
  nav: crmNav,
  routes: crmRoutes,
  permissions: [...CRM_PERMISSIONS],
}

export { crmNav, crmRoutes, CRM_PERMISSIONS }
