// Administration module — public API.
// The only surface other layers (registry, App) may import from this module.
// Composes the admin nav group, the 3 NEW routes, and the admin.* permission keys.
import type { ModuleDef } from '@/core/moduleTypes'
import { administrationNav } from './nav'
import { administrationRoutes } from './routes'
import { ADMIN_PERMISSIONS } from './permissions'

export const administrationModule: ModuleDef = {
  key: 'administration',
  nav: administrationNav,
  routes: administrationRoutes,
  permissions: [...ADMIN_PERMISSIONS],
}

export { administrationNav, administrationRoutes, ADMIN_PERMISSIONS }
