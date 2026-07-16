// Operations module — route table (consumed by the registry / App router).
// Routes are relative to the protected AppShell parent ('/'), matching the
// paths previously hard-coded in App.tsx. Page components are lazy-loaded from
// their current locations (files are NOT moved in this step) and render inside
// App's existing <Suspense> boundary — same URLs, same guards, same behavior.
import { lazy } from 'react'
import type { RouteObject } from 'react-router-dom'

const OperationsPage = lazy(() => import('@/pages/operations/OperationsPage'))
const ProjectsPage = lazy(() => import('@/pages/projects/ProjectsPage'))
const ProjectDetailPage = lazy(() => import('@/pages/projects/ProjectDetailPage'))

export const operationsRoutes: RouteObject[] = [
  // Operations overview — open to all staff (read-only board), as before.
  { path: 'operations', element: <OperationsPage /> },
  { path: 'projects', element: <ProjectsPage /> },
  { path: 'projects/:id', element: <ProjectDetailPage /> },
]
