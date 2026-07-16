// Administration module — route table for the NEW admin pages only.
// The existing /admin/users (UserManagementPage) and /settings routes are owned
// elsewhere and merely referenced from nav.ts; they are NOT re-declared here.
// Each page is lazy-loaded and wrapped in the existing ProtectedRoute guard.
import { lazy } from 'react'
import type { RouteObject } from 'react-router-dom'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'

const RolesPage = lazy(() => import('./pages/RolesPage'))
const AuditLogPage = lazy(() => import('./pages/AuditLogPage'))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'))

const ADMIN_ROLES = ['super_admin', 'director'] as const

export const administrationRoutes: RouteObject[] = [
  {
    path: 'admin/roles',
    element: (
      <ProtectedRoute allowedRoles={[...ADMIN_ROLES]}>
        <RolesPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'admin/audit',
    element: (
      <ProtectedRoute allowedRoles={[...ADMIN_ROLES]}>
        <AuditLogPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'admin/privacy',
    element: (
      <ProtectedRoute allowedRoles={[...ADMIN_ROLES]}>
        <PrivacyPage />
      </ProtectedRoute>
    ),
  },
]
