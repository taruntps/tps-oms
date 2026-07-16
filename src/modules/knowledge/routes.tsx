// Knowledge module — route table (the NEW enhanced surface only).
// The existing /knowledge page is declared in App.tsx and is intentionally NOT
// re-declared here. Paths are relative to the protected AppShell parent ('/'),
// matching the operations module convention. Pages are lazy-loaded and each
// element is wrapped in ProtectedRoute so only authenticated users can reach them.
import { lazy } from 'react'
import type { RouteObject } from 'react-router-dom'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'

const KnowledgeHubPage = lazy(() => import('./pages/KnowledgeHubPage'))
const ArticleViewPage = lazy(() => import('./pages/ArticleViewPage'))
const CategoriesAdminPage = lazy(() => import('./pages/CategoriesAdminPage'))

export const knowledgeRoutes: RouteObject[] = [
  {
    path: 'knowledge/browse',
    element: (
      <ProtectedRoute>
        <KnowledgeHubPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'knowledge/article/:id',
    element: (
      <ProtectedRoute>
        <ArticleViewPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'knowledge/categories',
    element: (
      <ProtectedRoute>
        <CategoriesAdminPage />
      </ProtectedRoute>
    ),
  },
]
