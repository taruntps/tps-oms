import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute, RoleGuard } from '@/components/shared/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { RoleBasedRedirect } from '@/components/shared/RoleBasedRedirect'
import { ToastProvider } from '@/components/shared/Toast'
import LoginPage from '@/pages/auth/LoginPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import ClientsPage from '@/pages/clients/ClientsPage'
import ClientDetailPage from '@/pages/clients/ClientDetailPage'
import ProjectsPage from '@/pages/projects/ProjectsPage'
import ProjectDetailPage from '@/pages/projects/ProjectDetailPage'
import OperationsPage from '@/pages/operations/OperationsPage'
import DirectorPage from '@/pages/director/DirectorPage'
import SettingsPage from '@/pages/settings/SettingsPage'
import PerformancePage from '@/pages/reports/PerformancePage'
import QueriesReportPage from '@/pages/reports/QueriesReportPage'
import KnowledgePage from '@/pages/knowledge/KnowledgePage'
import UserManagementPage from '@/pages/admin/UserManagementPage'
import EmployeesPage from '@/pages/employees/EmployeesPage'
import EmployeeDetailPage from '@/pages/employees/EmployeeDetailPage'
import AttendancePage from '@/pages/attendance/AttendancePage'
import ReferralsPage from '@/pages/referrals/ReferralsPage'
import TasksPage from '@/pages/tasks/TasksPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60, retry: 1 },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider />
        <BrowserRouter>
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
              <Route
                path="operations"
                element={
                  <ProtectedRoute allowedRoles={['super_admin','director','manager']}>
                    <OperationsPage />
                  </ProtectedRoute>
                }
              />

              {/* General authenticated routes */}
              <Route path="attendance" element={<AttendancePage />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="clients/:id" element={<ClientDetailPage />} />
              <Route path="referrals" element={
                <ProtectedRoute allowedRoles={['super_admin','director','manager']}>
                  <ReferralsPage />
                </ProtectedRoute>
              } />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="projects/:id" element={<ProjectDetailPage />} />
              <Route path="employees"           element={
                <ProtectedRoute allowedRoles={['super_admin','director','manager','hr']}>
                  <EmployeesPage />
                </ProtectedRoute>
              } />
              <Route path="employees/:id"       element={
                <ProtectedRoute allowedRoles={['super_admin','director','manager','hr','executive','accounts','auditor']}>
                  <EmployeeDetailPage />
                </ProtectedRoute>
              } />
              <Route path="knowledge"           element={<KnowledgePage />} />
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
              <Route path="settings"            element={
                <ProtectedRoute allowedRoles={['super_admin','director']}>
                  <SettingsPage />
                </ProtectedRoute>
              } />
              <Route path="admin/users"         element={
                <ProtectedRoute allowedRoles={['super_admin','director']}>
                  <UserManagementPage />
                </ProtectedRoute>
              } />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

// Suppress unused import warning — RoleGuard is exported for page-level use
void RoleGuard
