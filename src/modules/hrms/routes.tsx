// HRMS module — route table.
// Each page is lazy-loaded and wrapped in the existing ProtectedRoute guard.
// Paths are relative (mounted under the protected route tree by the registry).
import { lazy } from 'react'
import type { RouteObject } from 'react-router-dom'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'

const EmployeesPage = lazy(() => import('./pages/EmployeesPage'))
const EmployeeDetailPage = lazy(() => import('./pages/EmployeeDetailPage'))
const OrgSetupPage = lazy(() => import('./pages/OrgSetupPage'))
const HrSettingsPage = lazy(() => import('./pages/HrSettingsPage'))

const HRMS_ROLES = ['super_admin', 'director', 'manager', 'hr', 'auditor'] as const

export const hrmsRoutes: RouteObject[] = [
  {
    path: 'hrms/employees',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_ROLES]}>
        <EmployeesPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/employees/:id',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_ROLES]}>
        <EmployeeDetailPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/setup/org',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_ROLES]}>
        <OrgSetupPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/setup/policies',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_ROLES]}>
        <HrSettingsPage />
      </ProtectedRoute>
    ),
  },
]
