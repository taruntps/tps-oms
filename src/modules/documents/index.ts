// Documents module — public API.
// The only surface other layers (registry, App) may import from this module.
// To activate: add `documentsModule` to MODULES in src/core/registry.ts.
import type { ModuleDef } from '@/core/moduleTypes'
import { documentsNav } from './nav'
import { documentsRoutes } from './routes'
import { DOCUMENTS_PERMISSIONS } from './permissions'

export const documentsModule: ModuleDef = {
  key: 'documents',
  nav: documentsNav,
  routes: documentsRoutes,
  permissions: [...DOCUMENTS_PERMISSIONS],
}

export { documentsNav, documentsRoutes, DOCUMENTS_PERMISSIONS }
