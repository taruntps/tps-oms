// CRM module — route table.
// Each page is lazy-loaded and wrapped in the existing ProtectedRoute guard.
// Paths are relative (mounted under the protected route tree by the registry).
import { lazy } from 'react'
import type { RouteObject } from 'react-router-dom'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'

const LeadsPage = lazy(() => import('./pages/LeadsPage'))
const LeadDetailPage = lazy(() => import('./pages/LeadDetailPage'))
const ReferralsPage = lazy(() => import('./pages/ReferralsPage'))

const CRM_ROLES = ['super_admin', 'director', 'manager', 'executive'] as const

export const crmRoutes: RouteObject[] = [
  {
    path: 'crm/leads',
    element: (
      <ProtectedRoute allowedRoles={[...CRM_ROLES]}>
        <LeadsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'crm/leads/:id',
    element: (
      <ProtectedRoute allowedRoles={[...CRM_ROLES]}>
        <LeadDetailPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'crm/referrals',
    element: (
      <ProtectedRoute allowedRoles={[...CRM_ROLES]}>
        <ReferralsPage />
      </ProtectedRoute>
    ),
  },
]
