// Core Platform — module registry.
// The assembly point: each module contributes nav, routes, and permissions.
// App/Sidebar/Router consume the registry instead of hard-coding module details.
// Adding a module = write it + append one line to MODULES.
import type { RouteObject } from 'react-router-dom'
import type { ModuleDef, NavEntry } from './moduleTypes'
import { operationsModule } from '@/modules/operations'
import { administrationModule } from '@/modules/administration'
import { documentsModule } from '@/modules/documents'
import { knowledgeModule } from '@/modules/knowledge'
import { crmModule } from '@/modules/crm'
import { salesModule } from '@/modules/sales'
import { financeModule } from '@/modules/finance'
import { hrmsModule } from '@/modules/hrms'

// Wave 1 adds Administration, Document Management, Knowledge Base alongside Operations.
// Wave 2 adds the revenue spine: CRM → Sales → Finance & Accounts.
export const MODULES: ModuleDef[] = [
  operationsModule,
  administrationModule,
  documentsModule,
  knowledgeModule,
  crmModule,
  salesModule,
  financeModule,
  hrmsModule,
]

/** All module-owned routes, flattened, for mounting into the router tree. */
export function getAllRoutes(): RouteObject[] {
  return MODULES.flatMap((m) => m.routes)
}

/** Nav entries visible to a given role (entries without `roles` are visible to all). */
export function getNavFor(role: string | undefined): NavEntry[] {
  return MODULES.flatMap((m) => m.nav).filter(
    (entry) => !entry.roles || (role != null && entry.roles.includes(role))
  )
}

/** All permission keys defined across modules. */
export function getAllPermissions(): string[] {
  return MODULES.flatMap((m) => m.permissions)
}
