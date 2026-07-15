# TPS-OMS — Module Documentation (04)

**Purpose:** Per-module technical reference — files, entry points, hooks, DB objects, edge functions, and status for every module in the codebase.
**Scope:** Frontend feature modules + supporting libs. Database internals in Doc 05; APIs in Doc 06.
**Related Documents:** `01_PROJECT_INVENTORY.md`, `02_SYSTEM_ARCHITECTURE.md`, `03_BUSINESS_WORKFLOWS.md`, `05_DATABASE_DOCUMENTATION.md`, `06_API_REFERENCE.md`.
**Version:** 1.0 · **Creation Date:** 2026-07-14 · **Last Verification Date:** 2026-07-14
**Repository Branch:** `main` · **Commit Hash:** `9558f90` (working tree; docs uncommitted)

> Status legend: **Active** (in production flow), **Legacy** (present, superseded, not in active flow), **Deprecated** (explicitly retired), **Not Implemented**.

## Table of Contents
1. Module Index
2. Core / Shell (App, Auth, Layout)
3. Authentication / Login
4. Attendance & Face ID
5. Client Management
6. Project Management
7. Employee Management
8. Task Management
9. Dashboard / Director / Operations
10. Reports
11. Notifications
12. Settings
13. User Management (Admin)
14. Referrals
15. Knowledge Base
16. Shared Libraries & Utilities
17. Hooks Index
18. Legacy / Deprecated Code Inventory

---

## 1. Module Index

45 page components (`src/pages/**`), 11 layout/shared components, 20 hooks, 5 lib modules, 13 edge functions. 15 route-level modules (below).

## 2. Core / Shell

| Concern | File | Status |
|---|---|---|
| Bootstrap | `src/main.tsx` | Active |
| Routes + providers | `src/App.tsx` | Active |
| Auth context | `src/contexts/AuthContext.tsx` | Active |
| Supabase client | `src/lib/supabase.ts` | Active |
| Route guard | `src/components/shared/ProtectedRoute.tsx` (+ `RoleGuard`) | Active |
| Role redirect | `src/components/shared/RoleBasedRedirect.tsx` | Active |
| Shell | `src/components/layout/AppShell.tsx` | Active |
| Sidebar / TopBar / Notification bell | `Sidebar.tsx`, `TopBar.tsx`, `NotificationPanel.tsx` | Active |
| Error boundary | `src/components/shared/ErrorBoundary.tsx` | Active |
| Toast | `src/components/shared/Toast.tsx` | Active |
| Idle logout | `src/hooks/useIdleLogout.ts` (15 min) | Active |

## 3. Authentication / Login

- **Purpose:** password + passwordless-face login. **Entry:** `/login`. **File:** `src/pages/auth/LoginPage.tsx`.
- **DB/edge:** RPCs `check_login_locked`, `resolve_login_email`, `record_login_attempt`; `auth.signInWithPassword`; edge `face-login`; `auth.verifyOtp`.
- **Capture:** `PlainCapture.tsx` (Active). **Legacy:** face-descriptor login via on-device engine (removed from LoginPage; superseded).
- **Status:** Active.

## 4. Attendance & Face ID

- **Purpose:** geofenced punch + optional AWS face verification + guided enrollment. **Entry:** `/attendance`, `/attendance/photos`.
- **Files (Active):** `AttendancePage.tsx`, `AttendancePhotosPage.tsx`, `FaceScanRing.tsx`, `PlainCapture.tsx`.
- **Files (Legacy):** `FaceCapture.tsx` (on-device `@vladmandic/human`).
- **Hooks:** `useAttendance.ts` (settings, punches, days, office, punch), `useFaceVerify.ts` (`enrollFrame`, `useEnrollFace`, `useResetFace`, `useVerifiedPunch`); **Legacy:** `useFaceEnrollment.ts`.
- **Libs:** `attendanceGeo.ts` (Active: `haversineMeters`, `mapVerification`), `faceEngine.ts` (Legacy).
- **DB/edge:** RPC `punch_attendance`; edge `attendance-verify-punch`, `attendance-enroll-face`; tables `attendance_settings`, `attendance_punches`, `office_locations`; buckets `attendance`, `face-refs`.
- **Status:** Active (server-side AWS). Legacy on-device path present but unused.

## 5. Client Management

- **Entry:** `/clients`, `/clients/:id`. **Files:** `ClientsPage`, `ClientDetailPage`, `ClientForm`, `LicenseForm`, `CredentialReveal`, `ClientDocuments` (Legacy — Drive is primary).
- **Hooks:** `useClients`, `useLicenses`, `useClientDocuments`, `useReferrals`.
- **DB:** `clients`, `licenses`, `credential_access_log`, `referrals`; RPCs `store_fssai_credential`, `reveal_fssai_credential`, `delete_client`.
- **Status:** Active.

## 6. Project Management

- **Entry:** `/projects`, `/projects/:id?tab=`. **Files:** `ProjectsPage`, `ProjectDetailPage`, `ProjectForm`, `EditProjectModal`, `BlockRequestForm`, `ProjectTransfer`, `StageCard`, `StageAttachments`; tabs `ActivityTab`, `DocumentsTab`, `PaymentsTab`, `QueriesTab`, `RemarksTab`, `SoiTab`, `StagesTab`.
- **Hooks:** `useProjects`, `useProjectTransfers`, `useStageDocuments`, `useDocuments`, `usePayments`, `useAuthorityQueries`.
- **DB:** projects, stages, stage_templates, stage_timeline, stage_documents, authority_queries, query_points, soi_archive, soi_products, payments, block_requests, cancel_requests, project_transfers, project_products, project_remarks; RPCs approve_block_request, unblock_project, approve_cancel_request, initiate/respond/cancel_project_transfer, delete_project, generate_artwork_product_stages.
- **Status:** Active (core module).

## 7. Employee Management

- **Entry:** `/employees`, `/employees/:id`. **Files:** `EmployeesPage`, `EmployeeDetailPage`.
- **Hooks:** `useEmployees` (and inline `useEmployee`, `useEmployeeDetails`, `useUpsertEmployeeDetails`, `useUpdateEmployeeProfile`).
- **DB:** `profiles` (operational fields), `employee_details` (PII, strict RLS).
- **Status:** Active.

## 8. Task Management

- **Entry:** `/tasks`. **Files:** `TasksPage`, `TaskModal`. **Hook:** `useTasks`.
- **DB/edge:** tasks, task_comments, task_extension_requests; triggers `tasks_stamp_completed`, `tasks_guard_update`; RPCs `request/decide_task_extension`; edge `urgent-alerts`.
- **Status:** Active.

## 9. Dashboard / Director / Operations

- **Dashboard** `/dashboard` (`DashboardPage`, `useDashboard`): projects, notifications, punches, payments, quick task.
- **Director** `/director` (`DirectorPage`): KPIs, revenue, clock distribution, pipeline.
- **Operations** `/operations` (`OperationsPage`): approvals inbox, clock buckets.
- **Status:** Active.

## 10. Reports

- **Entry:** `/reports/performance`, `/reports/queries`. **Files:** `PerformancePage`, `QueriesReportPage`.
- **DB:** RPCs (migration 056) `rpc_project_timeline`, `rpc_stage_performance`, `rpc_employee_timeline`, `rpc_ontime_report`, `rpc_employee_summary`; view `v_stage_timeline`. Access via role or `report_permissions`.
- **Status:** Active (RPCs verified); some tab render paths **Not Verifiable from Source Code** in full depth.

## 11. Notifications

- **Entry:** `/notifications`. **File:** `NotificationsPage`. **Hook:** `useNotifications` (real-time subscription).
- **Components:** `NotificationPanel.tsx`. **DB:** `notifications`, `notification_log`.
- **Status:** Active.

## 12. Settings

- **Entry:** `/settings`. **Files:** `SettingsPage`, `AttendanceSettingsSection`, `NotificationControlsSection`, `ReminderSettingsSection`, `WhatsAppTesterSection`.
- **DB/edge:** `attendance_settings`, `office_locations` (upsert), `app_settings`, `reminder_settings`; edge `send-whatsapp` (tester).
- **Status:** Active. (Notification/Reminder sub-sections' full data wiring **partially traced**.)

## 13. User Management (Admin)

- **Entry:** `/admin/users`. **File:** `UserManagementPage`.
- **DB/edge:** `profiles` (roles, permission flags); RPC `admin_reset_password`; edge `invite-user`; `useResetFace` (edge `attendance-enroll-face` reset).
- **Status:** Active. Note: the visible "Enrolled" badge reads `profiles.face_enrolled_at` (maintained by the active server-side enroll flow).

## 14. Referrals

- **Entry:** `/referrals`. **File:** `ReferralsPage`. **Hook:** `useReferrals`. **DB:** `referrals`, `clients.referral_id`.
- **Status:** Active.

## 15. Knowledge Base

- **Entry:** `/knowledge`. **File:** `KnowledgePage`. **DB:** `knowledge_base`.
- **Status:** Active (list/category UI); full admin CRUD **not exhaustively traced** — **Partially Verifiable from Source Code**.

## 16. Shared Libraries & Utilities

| File | Purpose | Status |
|---|---|---|
| `src/lib/utils.ts` | `cn`, `formatRupees`, `formatDate`, `getExpiryStatus`, `CLOCK_CONFIG`, `getInitials` | Active |
| `src/lib/projectClock.ts` | per-stage clock derivation | Active |
| `src/lib/attendanceGeo.ts` | `haversineMeters`, `mapVerification` (unit-tested) | Active |
| `src/lib/faceEngine.ts` | on-device descriptor (`@vladmandic/human`) | **Legacy** |
| `src/lib/supabase.ts` | client + `getProfile` + remember-me storage | Active |
| `src/data/india.ts` | states/cities reference data | Active |
| `src/types/index.ts`, `database.ts` | domain + generated types | Active |

## 17. Hooks Index (20)

`useAttendance`, `useAuthorityQueries`, `useClientDocuments`, `useClients`, `useDashboard`, `useDocuments`, `useDrive`, `useEmployees`, `useFaceEnrollment` (Legacy), `useFaceVerify`, `useIdleLogout`, `useLicenses`, `useNotifications`, `usePayments`, `useProjectTransfers`, `useProjects`, `useReferrals`, `useStageDocuments`, `useTasks`, `useTheme`.

## 18. Legacy / Deprecated Code Inventory

| Item | Reason | Evidence |
|---|---|---|
| `src/lib/faceEngine.ts` | superseded by AWS server-side | not imported by active punch/login flow |
| `src/pages/attendance/FaceCapture.tsx` | superseded by `PlainCapture` | only imports `faceEngine`; not rendered in active flow |
| `src/hooks/useFaceEnrollment.ts` | superseded by `useFaceVerify` | imports `faceEngine` FACE_MODEL const only |
| `public/models/blazeface.*`, `faceres.*` | on-device model weights | used only by legacy engine |
| `profiles.face_descriptor`, `face_model` | on-device enrollment columns | not populated by active flow (0 rows) |
| `src/pages/clients/ClientDocuments.tsx` (+ `documents` bucket usage) | Google Drive is primary | present, not the primary doc path |

None of the above are deleted (per instruction, no code modified); they are documented as legacy.

---

*Grounded in source at commit `9558f90`. No application code modified.*
