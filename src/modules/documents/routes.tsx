// Documents module — route table (consumed by the registry / App router).
// Paths are relative to the protected AppShell parent ('/'). Pages are lazy-
// loaded and wrapped in ProtectedRoute (authenticated); finer-grained access is
// enforced in-page via useCan('documents.*') and by RLS on the server.
import { lazy } from 'react'
import type { RouteObject } from 'react-router-dom'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'

const DocumentsHubPage = lazy(() => import('./pages/DocumentsHubPage'))
const TemplatesPage = lazy(() => import('./pages/TemplatesPage'))

export const documentsRoutes: RouteObject[] = [
  {
    path: 'documents',
    element: (
      <ProtectedRoute>
        <DocumentsHubPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'documents/templates',
    element: (
      <ProtectedRoute>
        <TemplatesPage />
      </ProtectedRoute>
    ),
  },
]
