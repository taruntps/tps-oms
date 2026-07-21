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
const MyAttendancePage = lazy(() => import('./pages/MyAttendancePage'))
const AttendancePage = lazy(() => import('./pages/AttendancePage'))
const AttendanceApprovalsPage = lazy(() => import('./pages/AttendanceApprovalsPage'))
const ShiftsPage = lazy(() => import('./pages/ShiftsPage'))
const AttendanceReportsPage = lazy(() => import('./pages/AttendanceReportsPage'))

const HRMS_ROLES = ['super_admin', 'director', 'manager', 'hr', 'auditor'] as const
// My Attendance (ESS) is also reachable by individual-contributor roles.
const HRMS_SELF_ROLES = [...HRMS_ROLES, 'executive', 'accounts'] as const
// Approvals — roles that hold hrms.attendance.approve.
const HRMS_APPROVE_ROLES = ['super_admin', 'director', 'manager', 'hr'] as const
// Shift admin — roles that hold hrms.shift.manage.
const HRMS_SHIFT_ROLES = ['super_admin', 'director', 'hr'] as const

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
  // ── Attendance (M2) ──
  {
    path: 'hrms/attendance/me',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_SELF_ROLES]}>
        <MyAttendancePage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/attendance',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_ROLES]}>
        <AttendancePage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/attendance/approvals',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_APPROVE_ROLES]}>
        <AttendanceApprovalsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/attendance/shifts',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_SHIFT_ROLES]}>
        <ShiftsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/attendance/reports',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_ROLES]}>
        <AttendanceReportsPage />
      </ProtectedRoute>
    ),
  },
]
