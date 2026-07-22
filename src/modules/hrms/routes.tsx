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
const MyLeavePage = lazy(() => import('./pages/MyLeavePage'))
const LeavePage = lazy(() => import('./pages/LeavePage'))
const LeaveApprovalsPage = lazy(() => import('./pages/LeaveApprovalsPage'))
const LeaveSetupPage = lazy(() => import('./pages/LeaveSetupPage'))
const LeaveReportsPage = lazy(() => import('./pages/LeaveReportsPage'))
const AttendanceStatusPage = lazy(() => import('./pages/AttendanceStatusPage'))
// ── Payroll (M4) ──
const ComponentMasterPage = lazy(() => import('./pages/ComponentMasterPage'))
const SalaryStructuresPage = lazy(() => import('./pages/SalaryStructuresPage'))
const StatutoryConfigPage = lazy(() => import('./pages/StatutoryConfigPage'))
const PayrollRunsPage = lazy(() => import('./pages/PayrollRunsPage'))
const PayrollRunDetailPage = lazy(() => import('./pages/PayrollRunDetailPage'))
const PayslipsPage = lazy(() => import('./pages/PayslipsPage'))
// ── Recruitment & Lifecycle (M5) ──
const RequisitionsPage = lazy(() => import('./pages/RequisitionsPage'))
const CandidatesPage = lazy(() => import('./pages/CandidatesPage'))
const CandidateDetailPage = lazy(() => import('./pages/CandidateDetailPage'))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
const LifecyclePage = lazy(() => import('./pages/LifecyclePage'))
const SeparationsPage = lazy(() => import('./pages/SeparationsPage'))
// ── Performance (M6) ──
const MyPerformancePage = lazy(() => import('./pages/MyPerformancePage'))
const PerformancePage = lazy(() => import('./pages/PerformancePage'))
const PerformanceSetupPage = lazy(() => import('./pages/PerformanceSetupPage'))
const PerformanceReportsPage = lazy(() => import('./pages/PerformanceReportsPage'))
// ── Training (M7) ──
const TrainingPage = lazy(() => import('./pages/TrainingPage'))
const CertificationsPage = lazy(() => import('./pages/CertificationsPage'))
const MyTrainingPage = lazy(() => import('./pages/MyTrainingPage'))
// ── Assets (M8) ──
const AssetsPage = lazy(() => import('./pages/AssetsPage'))
const MyAssetsPage = lazy(() => import('./pages/MyAssetsPage'))

const HRMS_ROLES = ['super_admin', 'director', 'manager', 'hr', 'auditor'] as const
// My Attendance / My Leave (ESS) is also reachable by individual-contributor roles.
const HRMS_SELF_ROLES = [...HRMS_ROLES, 'executive', 'accounts'] as const
// Approvals — roles that hold hrms.attendance.approve / hrms.leave.approve.
const HRMS_APPROVE_ROLES = ['super_admin', 'director', 'manager', 'hr'] as const
// Shift admin — roles that hold hrms.shift.manage.
const HRMS_SHIFT_ROLES = ['super_admin', 'director', 'hr'] as const
// Leave/status setup — roles that hold hrms.leave.manage / hrms.config.manage (status master).
const HRMS_SETUP_ROLES = ['super_admin', 'director', 'hr'] as const
// Payroll (M4) — salary/payroll are confidential (hr/director/super_admin). Fine-grained
// process-vs-approve gating is enforced per action via useCan inside the pages.
const HRMS_PAYROLL_ROLES = ['super_admin', 'director', 'hr'] as const
// Recruitment (M5) — internal recruitment is open to the people-ops + hiring-manager
// roles; fine-grained manage/approve/interview gating is enforced per action via useCan.
const HRMS_RECRUIT_ROLES = ['super_admin', 'director', 'hr', 'manager'] as const
// Lifecycle (M5) — confirmation/transfer/promotion + separations & F&F are HR/leadership only.
const HRMS_LIFECYCLE_ROLES = ['super_admin', 'director', 'hr'] as const
// Performance (M6) — cycle/goal/calibration setup is HR/leadership only; the team
// Performance surface is open to the people-ops + manager roles; My Performance / Reports
// reach the individual-contributor roles too. Fine-grained gating is per-action via useCan.
const HRMS_PERF_MANAGE_ROLES = ['super_admin', 'director', 'hr'] as const

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
  // ── Leave (M3) ──
  {
    path: 'hrms/leave/me',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_SELF_ROLES]}>
        <MyLeavePage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/leave',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_ROLES]}>
        <LeavePage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/leave/approvals',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_APPROVE_ROLES]}>
        <LeaveApprovalsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/leave/setup',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_SETUP_ROLES]}>
        <LeaveSetupPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/leave/reports',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_ROLES]}>
        <LeaveReportsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/setup/attendance-status',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_SETUP_ROLES]}>
        <AttendanceStatusPage />
      </ProtectedRoute>
    ),
  },
  // ── Payroll (M4) ──
  {
    path: 'hrms/payroll/components',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_PAYROLL_ROLES]}>
        <ComponentMasterPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/payroll/structures',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_PAYROLL_ROLES]}>
        <SalaryStructuresPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/payroll/statutory',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_PAYROLL_ROLES]}>
        <StatutoryConfigPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/payroll/runs',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_PAYROLL_ROLES]}>
        <PayrollRunsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/payroll/runs/:id',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_PAYROLL_ROLES]}>
        <PayrollRunDetailPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/payroll/payslips',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_SELF_ROLES]}>
        <PayslipsPage />
      </ProtectedRoute>
    ),
  },
  // ── Recruitment (M5) ──
  {
    path: 'hrms/recruit/requisitions',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_RECRUIT_ROLES]}>
        <RequisitionsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/recruit/candidates',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_RECRUIT_ROLES]}>
        <CandidatesPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/recruit/candidates/:id',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_RECRUIT_ROLES]}>
        <CandidateDetailPage />
      </ProtectedRoute>
    ),
  },
  // ── Lifecycle (M5) ──
  {
    path: 'hrms/lifecycle/onboarding',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_LIFECYCLE_ROLES]}>
        <OnboardingPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/lifecycle',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_LIFECYCLE_ROLES]}>
        <LifecyclePage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/lifecycle/separations',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_LIFECYCLE_ROLES]}>
        <SeparationsPage />
      </ProtectedRoute>
    ),
  },
  // ── Performance (M6) ──
  {
    path: 'hrms/performance/me',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_SELF_ROLES]}>
        <MyPerformancePage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/performance',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_ROLES]}>
        <PerformancePage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/performance/cycles',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_PERF_MANAGE_ROLES]}>
        <PerformanceSetupPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/performance/reports',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_SELF_ROLES]}>
        <PerformanceReportsPage />
      </ProtectedRoute>
    ),
  },
  // ── Training (M7) ──
  {
    path: 'hrms/training',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_ROLES]}>
        <TrainingPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/training/certifications',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_ROLES]}>
        <CertificationsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/training/me',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_SELF_ROLES]}>
        <MyTrainingPage />
      </ProtectedRoute>
    ),
  },
  // ── Assets (M8) ──
  {
    path: 'hrms/assets',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_ROLES]}>
        <AssetsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'hrms/assets/me',
    element: (
      <ProtectedRoute allowedRoles={[...HRMS_SELF_ROLES]}>
        <MyAssetsPage />
      </ProtectedRoute>
    ),
  },
]
