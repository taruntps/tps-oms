import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute, RoleGuard } from '@/components/shared/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { RoleBasedRedirect } from '@/components/shared/RoleBasedRedirect'
import { ToastProvider } from '@/components/shared/Toast'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { getAllRoutes } from '@/core/registry'

// V2: route-based code splitting — each page is a lazily-loaded chunk so the
// initial JS payload is a fraction of the previous single ~1.3 MB bundle.
// URLs, guards, and page behavior are unchanged.
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'))
const ClientsPage = lazy(() => import('@/pages/clients/ClientsPage'))
const ClientDetailPage = lazy(() => import('@/pages/clients/ClientDetailPage'))
const DirectorPage = lazy(() => import('@/pages/director/DirectorPage'))
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'))
const PerformancePage = lazy(() => import('@/pages/reports/PerformancePage'))
const KnowledgePage = lazy(() => import('@/pages/knowledge/KnowledgePage'))
const UserManagementPage = lazy(() => import('@/pages/admin/UserManagementPage'))
const EmployeesPage = lazy(() => import('@/pages/employees/EmployeesPage'))
const EmployeeDetailPage = lazy(() => import('@/pages/employees/EmployeeDetailPage'))
const AttendancePage = lazy(() => import('@/pages/attendance/AttendancePage'))
const AttendancePhotosPage = lazy(() => import('@/pages/attendance/AttendancePhotosPage'))
const ReferralsPage = lazy(() => import('@/pages/referrals/ReferralsPage'))
const TasksPage = lazy(() => import('@/pages/tasks/TasksPage'))
const NotificationsPage = lazy(() => import('@/pages/notifications/NotificationsPage'))
const WhatsAppCampaignsPage = lazy(() => import('@/pages/marketing/WhatsAppCampaignsPage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // V2: data is considered fresh for 60s and the cache is retained for 5m.
      // This eliminates the refetch storm (duplicate profile/notification/project
      // fetches on every mount/focus) measured in the performance audit (doc 18).
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// Lightweight fallback shown while a route chunk loads.
function RouteFallback() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[40vh]">
      <div className="w-7 h-7 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider />
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
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
              {/* Module-registry routes (Operations + Wave-1: Administration, Documents,
                  Knowledge). Existing hardcoded routes below remain for backward compatibility
                  (e.g. /admin/users, /knowledge, /settings) — modules only add NEW routes. */}
              {getAllRoutes().map((r) => (
                <Route key={r.path} path={r.path} element={r.element} />
              ))}

              {/* General authenticated routes */}
              <Route path="attendance" element={<AttendancePage />} />
              <Route path="attendance/photos" element={
                <ProtectedRoute allowedRoles={['super_admin','director','manager','hr']}>
                  <AttendancePhotosPage />
                </ProtectedRoute>
              } />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="clients/:id" element={<ClientDetailPage />} />
              <Route path="referrals" element={
                <ProtectedRoute allowedRoles={['super_admin','director','manager']}>
                  <ReferralsPage />
                </ProtectedRoute>
              } />
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
                <ProtectedRoute>
                  <PerformancePage />
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
              <Route path="marketing/whatsapp" element={
                <ProtectedRoute allowedRoles={['super_admin','director','hr']}>
                  <WhatsAppCampaignsPage />
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
