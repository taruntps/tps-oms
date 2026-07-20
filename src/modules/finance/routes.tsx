// Finance & Accounts module — route table.
// Each page is lazy-loaded and wrapped in the existing ProtectedRoute guard.
// Paths are relative (mounted under the protected route tree by the registry).
import { lazy } from 'react'
import type { RouteObject } from 'react-router-dom'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'

const FinanceDashboard = lazy(() => import('./pages/FinanceDashboard'))
const InvoicesPage = lazy(() => import('./pages/InvoicesPage'))
const InvoiceDetailPage = lazy(() => import('./pages/InvoiceDetailPage'))
const PaymentsPage = lazy(() => import('./pages/PaymentsPage'))
const GovtFeesPage = lazy(() => import('./pages/GovtFeesPage'))

const FINANCE_ROLES = ['super_admin', 'director', 'manager', 'accounts', 'auditor'] as const

export const financeRoutes: RouteObject[] = [
  {
    path: 'finance',
    element: (
      <ProtectedRoute allowedRoles={[...FINANCE_ROLES]}>
        <FinanceDashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: 'finance/invoices',
    element: (
      <ProtectedRoute allowedRoles={[...FINANCE_ROLES]}>
        <InvoicesPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'finance/invoices/:id',
    element: (
      <ProtectedRoute allowedRoles={[...FINANCE_ROLES]}>
        <InvoiceDetailPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'finance/payments',
    element: (
      <ProtectedRoute allowedRoles={[...FINANCE_ROLES]}>
        <PaymentsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'finance/govt-fees',
    element: (
      <ProtectedRoute allowedRoles={[...FINANCE_ROLES]}>
        <GovtFeesPage />
      </ProtectedRoute>
    ),
  },
]
