// Sales module — route table.
// Each page is lazy-loaded and wrapped in the existing ProtectedRoute guard.
// Paths are relative (mounted under the protected route tree by the registry).
import { lazy } from 'react'
import type { RouteObject } from 'react-router-dom'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'

const DealsPage = lazy(() => import('./pages/DealsPage'))
const DealDetailPage = lazy(() => import('./pages/DealDetailPage'))
const ServicesPage = lazy(() => import('./pages/ServicesPage'))

const SALES_ROLES = ['super_admin', 'director', 'manager', 'executive'] as const

export const salesRoutes: RouteObject[] = [
  {
    path: 'sales/deals',
    element: (
      <ProtectedRoute allowedRoles={[...SALES_ROLES]}>
        <DealsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'sales/deals/:id',
    element: (
      <ProtectedRoute allowedRoles={[...SALES_ROLES]}>
        <DealDetailPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'sales/services',
    element: (
      <ProtectedRoute allowedRoles={[...SALES_ROLES]}>
        <ServicesPage />
      </ProtectedRoute>
    ),
  },
]
