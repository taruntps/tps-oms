// Administration module — route table for the NEW admin pages only.
// The existing /admin/users (UserManagementPage) and /settings routes are owned
// elsewhere and merely referenced from nav.ts; they are NOT re-declared here.
// Auth-only ProtectedRoute here; the central RoutePermissionGuard gates each route by
// its nav permission (admin.role.manage / admin.audit.view / admin.privacy.manage) so
// access follows the permission model + per-employee overrides, not a hard role lock.
import { lazy } from 'react'
import type { RouteObject } from 'react-router-dom'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'

const RolesPage = lazy(() => import('./pages/RolesPage'))
const AuditLogPage = lazy(() => import('./pages/AuditLogPage'))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'))

export const administrationRoutes: RouteObject[] = [
  {
    path: 'admin/roles',
    element: (
      <ProtectedRoute>
        <RolesPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'admin/audit',
    element: (
      <ProtectedRoute>
        <AuditLogPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'admin/privacy',
    element: (
      <ProtectedRoute>
        <PrivacyPage />
      </ProtectedRoute>
    ),
  },
]
