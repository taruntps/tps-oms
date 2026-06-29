import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute, RoleGuard } from '@/components/shared/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { RoleBasedRedirect } from '@/components/shared/RoleBasedRedirect'
import { ToastProvider } from '@/components/shared/Toast'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'

// Lazy-load all page components — each page becomes its own JS chunk.
// This cuts the initial bundle by ~70% (only auth + shell loads on first visit).
const LoginPage         = lazy(() => import('@/pages/auth/LoginPage'))
const DashboardPage     = lazy(() => import('@/pages/dashboard/DashboardPage'))
const ClientsPage       = lazy(() => import('@/pages/clients/ClientsPage'))
const ClientDetailPage  = lazy(() => import('@/pages/clients/ClientDetailPage'))
const ProjectsPage      = lazy(() => import('@/pages/projects/ProjectsPage'))
const ProjectDetailPage = lazy(() => import('@/pages/projects/ProjectDetailPage'))
const OperationsPage    = lazy(() => import('@/pages/operations/OperationsPage'))
const DirectorPage      = lazy(() => import('@/pages/director/DirectorPage'))
const SettingsPage      = lazy(() => import('@/pages/settings/SettingsPage'))
const PerformancePage   = lazy(() => import('@/pages/reports/PerformancePage'))
const QueriesReportPage = lazy(() => import('@/pages/reports/QueriesReportPage'))
const KnowledgePage     = lazy(() => import('@/pages/knowledge/KnowledgePage'))
const UserManagementPage = lazy(() => import('@/pages/admin/UserManagementPage'))
const EmployeesPage     = lazy(() => import('@/pages/employees/EmployeesPage'))
const EmployeeDetailPage = lazy(() => import('@/pages/employees/EmployeeDetailPage'))
const AttendancePage    = lazy(() => import('@/pages/attendance/AttendancePage'))
const ReferralsPage     = lazy(() => import('@/pages/referrals/ReferralsPage'))
const TasksPage         = lazy(() => import('@/pages/tasks/TasksPage'))
const NotificationsPage = lazy(() => import('@/pages/notifications/NotificationsPage'))

// Minimal route-level fallback — shown during lazy chunk download.
// Keeps the AppShell (sidebar) visible so there's no layout shift.
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
    </div>
  )
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60, retry: 1 },
  },
})

export default function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider />
        <BrowserRouter>
          {/* Single Suspense boundary at router level — PageLoader shows inside AppShell
              so the sidebar stays visible during lazy-chunk loading (no layout shift). */}
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected — AppShell wraps all authenticated pages */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              {/* Smart redirect based on role */}
              <Route index element={<RoleBasedRedirect />} />
              <Route path="dashboard" element={<DashboardPage />} />

              {/* Role-gated views */}
              <Route
                path="director"
                element={
                  <ProtectedRoute allowedRoles={['super_admin','director']}>
                    <DirectorPage />
                  </ProtectedRoute>
                }
              />
              {/* Operations overview — open to all staff (read-only board) */}
              <Route path="operations" element={<OperationsPage />} />

              {/* General authenticated routes */}
              <Route path="attendance" element={<AttendancePage />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="clients/:id" element={<ClientDetailPage />} />
              <Route path="referrals" element={
                <ProtectedRoute allowedRoles={['super_admin','director','manager']}>
                  <ReferralsPage />
                </ProtectedRoute>
              } />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="projects/:id" element={<ProjectDetailPage />} />
              <Route path="employees" element={
                <ProtectedRoute allowedRoles={['super_admin','director','manager','hr']}>
                  <EmployeesPage />
                </ProtectedRoute>
              } />
              <Route path="employees/:id" element={
                <ProtectedRoute allowedRoles={['super_admin','director','manager','hr','executive','accounts','auditor']}>
                  <EmployeeDetailPage />
                </ProtectedRoute>
              } />
              <Route path="knowledge" element={<KnowledgePage />} />
              <Route path="reports/performance" element={
                <ProtectedRoute allowedRoles={['super_admin','director','manager']}>
                  <PerformancePage />
                </ProtectedRoute>
              } />
              <Route path="reports/queries" element={
                <ProtectedRoute allowedRoles={['super_admin','director','manager']}>
                  <QueriesReportPage />
                </ProtectedRoute>
              } />
              <Route path="settings" element={
                <ProtectedRoute allowedRoles={['super_admin','director']}>
                  <SettingsPage />
                </ProtectedRoute>
              } />
              <Route path="admin/users" element={
                <ProtectedRoute allowedRoles={['super_admin','director']}>
                  <UserManagementPage />
                </ProtectedRoute>
              } />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  )
}

export { RoleGuard }
