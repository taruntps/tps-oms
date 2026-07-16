// Knowledge module — public API.
// The only surface other layers (registry, App) may import from this module.
import type { ModuleDef } from '@/core/moduleTypes'
import { knowledgeNav } from './nav'
import { knowledgeRoutes } from './routes'
import { KNOWLEDGE_PERMISSIONS } from './permissions'

export const knowledgeModule: ModuleDef = {
  key: 'knowledge',
  nav: knowledgeNav,
  routes: knowledgeRoutes,
  permissions: [...KNOWLEDGE_PERMISSIONS],
}

export { knowledgeNav, knowledgeRoutes, KNOWLEDGE_PERMISSIONS }
