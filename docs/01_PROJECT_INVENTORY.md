# TPS-OMS — PROJECT INVENTORY

> **Single source of truth for the TPS Operations Management System (TPS Xperts Portal).**
> Every statement below is derived from the actual repository at inspection time. Where a capability is absent, it is marked **Not Implemented**. Where a fact could not be fully verified from source, it is called out under *Uncertainties* (§ End Report). No code was modified, refactored, or fixed to produce this document.
>
> **Repository root:** `/Users/tarunsingh/Documents/Projects/tps-oms`
> **Live URL:** https://portal.tpsxpert.com
> **Inspection scope:** all tracked + untracked source files (excluding `node_modules/`, `.git/`, `dist/`).

---

## 1. Executive Summary

TPS-OMS is a **role-based regulatory-compliance & project-management portal** for TPS Xperts (an FSSAI / food-safety consultancy). It is a single-page React application (Vite + TypeScript) hosted on **GitHub Pages** at `portal.tpsxpert.com`, backed entirely by **Supabase** (PostgreSQL, Auth, Storage, and Deno Edge Functions). There is no separate application server; all server logic runs as Postgres functions/triggers (RLS-enforced) and Supabase Edge Functions.

The system manages the full lifecycle of FSSAI consulting engagements: clients & licences → projects → multi-stage workflow with per-stage "clocks" (employee / client / authority) → payments, authority-query rounds, SOI archives, documents (Google Drive), and reporting. It additionally includes an **attendance module** with GPS geofencing and **server-side AWS Rekognition face verification**, a **notifications** layer delivered in-app + via **WhatsApp (Meta Cloud API)** + **email (ZeptoMail)**, task management, referrals, a knowledge base, and admin user management.

**Statistics (verified, exact):** 222 git-tracked files, 226 total source files (excluding `node_modules/`, `.git/`, `dist/`; includes this inventory doc), 62 folders. 19,520 lines of frontend TS/TSX, 1,855 lines of edge-function TS, 5,409 lines of SQL across **77 migrations**. **13 edge functions** (+1 shared library), **20** React hooks, **45** page components, **2** unit-test files, **40** DB tables, **11** enums, **52** DB functions, **27** triggers, **2** views, **4** storage buckets, **7** user roles.

---

## 2. Business Purpose of the Portal

To operate a pharma/nutraceutical & food-safety regulatory consultancy end-to-end: track client companies and their FSSAI licences (Central/State), run the multi-stage FSSAI application/renewal/modification workflow with accountability clocks, manage authority deficiency queries (30-day response windows), archive Statements of Intent (SOI), record payments (consulting + government fees), and give directors/managers operational visibility. Attendance (geofenced + face-verified punch) and HR staff records support internal operations.

---

## 3. Overall Project Overview

- **Type:** SPA (client-rendered) + Backend-as-a-Service.
- **Frontend:** React 18 + Vite 5 + TypeScript 5, TailwindCSS, Radix UI primitives, TanStack Query, React Router v6.
- **Backend:** Supabase — PostgreSQL (RLS, functions, triggers, pg_cron), Auth, Storage buckets, Deno Edge Functions.
- **Hosting/CI:** GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`), custom domain `portal.tpsxpert.com` (`public/CNAME`).
- **External services:** AWS Rekognition (face), Meta WhatsApp Cloud API, ZeptoMail (email), Google Drive API, Google Sheets (client sync).

---

## 4. Folder Structure

```
tps-oms/
├── .github/workflows/deploy.yml        # CI/CD → GitHub Pages
├── .claude/launch.json                 # local dev launcher (npm run dev, port 5173)
├── docs/                               # specs, plans, this inventory
│   └── superpowers/{specs,plans}/      # dated design specs & implementation plans
├── google-sheets/sync-clients.gs       # Google Apps Script (Sheets ↔ Supabase)
├── public/
│   ├── CNAME, 404.html, logo.png       # Pages domain, SPA deep-link restore, favicon
│   └── models/                         # @vladmandic/human on-device models (LEGACY, see §19)
├── scripts/                            # one-off Node import scripts (.mjs)
├── src/
│   ├── main.tsx, App.tsx, index.css    # bootstrap, routes, theme CSS
│   ├── components/{layout,shared}/      # AppShell, Sidebar, TopBar, ProtectedRoute, Toast, …
│   ├── contexts/AuthContext.tsx
│   ├── hooks/                          # 20 data hooks (React Query)
│   ├── lib/                            # supabase client, utils, projectClock, attendanceGeo, faceEngine
│   ├── pages/                          # feature pages (auth, attendance, clients, projects, …)
│   └── types/                          # index.ts (domain enums/types) + database.ts (generated)
├── supabase/
│   ├── functions/                      # 13 Deno edge functions + _shared/rekognition.ts
│   └── migrations/                     # 001–077 SQL migrations
├── package.json, vite.config.ts, tailwind.config.ts, tsconfig*.json, vitest.config.ts
└── .env.example, .env.local (gitignored)
```

**Verified counts (exact):** 226 files, 62 folders; 77 SQL, 59 TSX (45 pages + 11 layout/shared + main.tsx + App.tsx + AuthContext.tsx), 30 TS in `src/` (20 hooks + 5 lib + 2 tests + 3 types/data), 14 edge-function TS files (13 functions + `_shared/rekognition.ts`), MD/JSON/MJS/HTML/CSS/GS/PNG/BIN config & asset files.

---

## 5. Technology Overview

| Layer | Technology |
|---|---|
| Language | TypeScript 5.5 (frontend & edge), SQL (PL/pgSQL), Deno (edge runtime) |
| Frontend framework | React 18.3 + React Router 6.26 |
| Build tool | Vite 5.4 (`@vitejs/plugin-react`) |
| Styling | TailwindCSS 3.4 + tailwindcss-animate, Radix UI, class-variance-authority, clsx, tailwind-merge |
| Data layer | TanStack React Query 5.56, `@supabase/supabase-js` 2.45 |
| Forms/validation | react-hook-form 7.53 + zod 3.23 + @hookform/resolvers |
| Tables | @tanstack/react-table 8.20 |
| Excel | xlsx (SheetJS) 0.18 |
| On-device face (legacy) | @vladmandic/human 3.3 |
| Testing | Vitest 4.1 |
| Lint | ESLint 9 + typescript-eslint + react-hooks/react-refresh plugins |
| Deploy | gh-pages 6.1 + GitHub Actions |

---

## 6. Runtime Environment

- **Client runtime:** modern browser (SPA). `index.html` sets `noindex`, preloads Google Fonts (Manrope, Inter, JetBrains Mono) and Material Symbols; includes a GitHub-Pages SPA deep-link restore script paired with `public/404.html`.
- **Edge runtime:** Deno (Supabase Edge Functions, `SupabaseEdgeRuntime/1.74.2` observed), std@0.177.0 HTTP server, `esm.sh` for `@supabase/supabase-js`.
- **Database:** Supabase-hosted PostgreSQL 17 (project region ap-south-1).
- **Local dev:** `npm run dev` (Vite) on port 5173 (`.claude/launch.json`).
- **Node (CI):** Node 24 (`deploy.yml`).

---

## 7. Frontend Stack

- **Bootstrap:** `src/main.tsx` → `<StrictMode><App/></StrictMode>`.
- **Provider order (`src/App.tsx`):** `ErrorBoundary` → `QueryClientProvider` (staleTime 0, retry 1, refetchOnWindowFocus true) → `AuthProvider` → `ToastProvider` → `BrowserRouter` → `Routes`.
- **Aliases:** `@` → `./src` (vite + vitest + tsconfig).
- **Theme:** "Arctic Precision" — Manrope (display), Inter (body), JetBrains Mono (labels); mesh-gradient backdrop; theme values `ocean | slate | sand | forest | white` persisted to `profiles.dashboard_theme` + localStorage via `useTheme`.
- **Icons:** Material Symbols Outlined via `Sym.tsx` wrapper.

---

## 8. Backend Stack

- **No dedicated app server.** Backend = Supabase PostgreSQL (RLS + PL/pgSQL functions + triggers + pg_cron) plus **13 Deno Edge Functions** + 1 shared library (`_shared/rekognition.ts`) under `supabase/functions/`. See §15, §30, §31.
- **Server logic patterns:** SECURITY DEFINER RPCs for privileged actions (admin user/password, credential vault, project lifecycle, punch), triggers for auto-codes/timestamps/timeline capture/notifications, edge functions for anything needing external APIs or service-role privileges.

---

## 9. Database Technology

- **PostgreSQL** (Supabase). **77 migrations** (`supabase/migrations/001…077`).
- **Extensions:** `uuid-ossp`, `pg_cron`, `supabase_vault`, `moddatetime`, `pg_net`.
- **40 tables** (distinct `CREATE TABLE`), **11 enum types**, **52 functions/RPCs** (distinct names), **27 triggers** (distinct names), **2 views** (`attendance_days`, `v_stage_timeline` — both SECURITY INVOKER). RLS enabled on all tables.
- Full detail in §32.

---

## 10. Storage Technology

Supabase Storage, four buckets (RLS on `storage.objects`):

| Bucket | Visibility | Purpose | Path prefix | Migration |
|---|---|---|---|---|
| `avatars` | Public | Profile photos | `<user_id>/…` | 015 |
| `documents` | Private | Project + stage attachments | `clients/`, `stages/` | 002, 009, 034 |
| `attendance` | Private | Punch selfies (signed URLs, 1h) | `<user_id>/<date>/<ts>.jpg` | 019 |
| `face-refs` | Private | One enrollment reference face per user | `<user_id>/reference.jpg` | 075 |

Google Drive is used as the **primary document store** for clients/projects (folders linked per entity via `set_entity_drive_folder`, browsed through `DriveTab.tsx` → `drive-ops` edge function).

---

## 11. Authentication Method

- **Supabase Auth** (`src/lib/supabase.ts`), storageKey `tps-oms-auth`, autoRefreshToken on.
- **"Remember me":** default persists to `localStorage`; if disabled → `sessionStorage` (tab-scoped) via a custom `rememberStorage` adapter.
- **Login (`LoginPage.tsx`):**
  1. **Password:** identifier (email or employee code) resolved via RPC `resolve_login_email`; brute-force gated by `check_login_locked` / `record_login_attempt` (5 failures / 15 min lock); then `signInWithPassword`.
  2. **Face login (passwordless):** `PlainCapture` photo → `face-login` edge function → AWS Rekognition CompareFaces vs enrolled reference → returns magic-link `token_hash` → `supabase.auth.verifyOtp({type:'magiclink'})`. Password remains the always-available fallback.
- **Idle auto-logout:** `useIdleLogout` (15 minutes) mounted in `AppShell`.

---

## 12. Authorization Method

- **Route gating:** `ProtectedRoute` (auth required; optional `allowedRoles`) + `RoleBasedRedirect` (role → home page). `RoleGuard` for in-component conditional rendering (exported from `App.tsx`).
- **DB enforcement:** Row-Level Security on every table, primarily via `has_role(variadic user_role[])` / `auth_role()` (SECURITY DEFINER, stable), with owner-based fallbacks (`auth.uid()`, `created_by`, `assigned_to`).
- **Fine-grained flags on `profiles`:** `can_edit_clients`, `can_be_assigned`, `can_assign`, `can_view_all_projects`, `report_permissions` (JSON array of grantable report tabs).

---

## 13. User Roles

Enum `user_role` (migration 001): **`super_admin`, `director`, `manager`, `executive`, `accounts`, `hr`, `auditor`** (7 roles).

Role → landing page (`RoleBasedRedirect`): super_admin/director → `/director`; manager → `/operations`; executive/accounts → `/dashboard`; hr → `/employees`; auditor → `/reports/performance`.

---

## 14. Permission Model

Representative permission constants (`src/types/index.ts`):
- `ROLES_WITH_PAYMENT_ACCESS` = super_admin, director, manager, accounts
- `ROLES_WHO_CAN_CLOSE` = super_admin, director, manager
- `ROLES_WITH_CREDENTIAL_ACCESS` = super_admin, director, manager
- `ROLES_WHO_CAN_ASSIGN` = super_admin, director, manager
- `ROLES_WHO_CAN_APPROVE_BLOCKS` = super_admin, director, manager

DB permission helpers: `fn_can_edit_clients()`, `fn_can_view_all_projects()`, `fn_can_assign()`. Report access: role OR `profiles.report_permissions` grant (grantable tabs: `pending_payments`, `queries`, `govt_fees`).

---

## 15. All Modules Present

Frontend feature modules (by route): **Auth/Login**, **Dashboard**, **Director View**, **Operations**, **Attendance** (+ Photos review), **Tasks**, **Notifications**, **Clients** (+ detail), **Referrals**, **Projects** (+ detail, 7 tabs), **Employees** (+ detail), **Knowledge Base**, **Reports** (Performance + Queries), **Settings**, **User Management (Admin)**.

Backend modules: **13 edge functions** — Face/AWS (3: `attendance-enroll-face`, `attendance-verify-punch`, `face-login`; + shared `_shared/rekognition.ts` signer), Notifications email/WhatsApp (7: `send-whatsapp`, `notify-dispatch`, `block-escalate`, `notify-payment-weekly`, `daily-reminders`, `urgent-alerts`, `test-mail`), Google (2: `drive-ops`, `sheets-sync`), user admin (1: `invite-user`). **Database** — auth/admin, clients/licences/vault, projects/stages/workflow, payments, queries/SOI, attendance, tasks/reminders, notifications, reporting, audit.

---

## 16. Features Implemented (verified working from code)

- Authentication (password + brute-force lockout) and **passwordless face login** (server-side AWS).
- Role-based routing & RLS authorization; 15-min idle logout; "Remember me".
- **Client management:** CRUD, GSTIN/PAN handling, multiple FSSAI licences with expiry badges, **encrypted credential vault** (store/reveal with audit log), referral linkage, Google Drive document folder.
- **Project workflow engine:** auto stage generation from `stage_templates`, per-stage clocks (employee/client/authority), block/unblock with manager approval, project transfers (forced/accept), cancellation approval flow, auto project-code (`TPS-YYYY-NNNN`).
- **Payments:** records + rollup trigger (`fn_recalc_project_payment`), status (`pending/partial/paid/overdue/refunded`), mark-complete/unlock.
- **Authority queries:** deficiency rounds, sub-points, 30-day response due, auto stage flip on response.
- **SOI archive:** domestic/export, dynamic columns (`soi_products.data` jsonb).
- **Stage documents:** per-stage version auto-increment.
- **Attendance:** geofenced GPS punch (haversine in `punch_attendance`), photo-only mode, **face verification** (server-side AWS, allow-and-flag), guided **ring enrollment**, admin/self face reset, HR photo-review gallery.
- **Tasks:** CRUD, comments, extension requests/decisions, urgent-alert emails.
- **Notifications:** in-app (real-time subscription) + WhatsApp dispatch + email digests/alerts.
- **Reporting RPCs** (migration 056): project timeline, stage performance, employee timeline, on-time report, employee summary.
- **Referrals, Knowledge Base, Employee records (with sensitive PII table + RLS), User Management** (roles, permissions, password/face reset, invite/create).
- **Google Drive** file/folder operations and Workspace→PDF export (`drive-ops`); **Google Sheets** client sync (`sheets-sync`).
- **Excel:** `xlsx` (SheetJS) dependency present (export capability).

---

## 17. Features Partially Implemented / Legacy

- **On-device face engine** (`@vladmandic/human`, `public/models/*.bin`, `src/lib/faceEngine.ts`, `src/pages/attendance/FaceCapture.tsx`, `src/hooks/useFaceEnrollment.ts`): fully coded and unit-tested, but **superseded** by the server-side AWS flow and **not used** in the current punch/login paths. Legacy columns `profiles.face_descriptor` / `face_model` are no longer populated by the active flow (current enrollment stores to the `face-refs` bucket + sets `profiles.face_enrolled_at`).
- **`ClientDocuments.tsx`** (client document upload to `documents/clients/`): present but effectively superseded by the Google Drive tab.
- **Reports UI:** page shells + backing RPCs (056) exist; not every report tab's rendering was individually verified in this pass (see Uncertainties).
- **Knowledge Base:** list/category UI present; full admin CRUD not exhaustively verified in this pass.
- **WhatsApp go-live** depends on `app_settings.whatsapp_enabled` + Meta credentials stored in `app_settings` (config-gated, not code-gated).

---

## 18. Features NOT Implemented (absent from repository)

- **OCR** — Not Implemented.
- **SMS** — Not Implemented (messaging is WhatsApp + email + in-app only).
- **Web push / mobile push notifications** — Not Implemented (no service worker / FCM / web-push).
- **Standalone PDF generation library** — Not Implemented (PDF is only via Google Workspace→PDF export in `drive-ops`).
- **Docker / containerization** — Not present.
- **Dedicated monitoring/APM (Sentry, Datadog, etc.)** — Not Implemented (logging via Supabase logs + DB audit tables only).
- **Traditional server middleware** — Not applicable (SPA + edge functions; auth/authorization via RLS + per-function JWT checks).
- **End-to-end / integration test suite** — Not present (only 2 pure-unit test files).

---

## 19. Face ID Implementation Overview

**Current (active) architecture — server-side AWS Rekognition:**
- **Shared signer:** `supabase/functions/_shared/rekognition.ts` — hand-rolled AWS SigV4 caller, region `ap-south-1`, actions `DetectFaces` / `CompareFaces`. Secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
- **Enrollment:** `attendance-enroll-face` — guided ring (`FaceScanRing.tsx`): `want:'center'` validates a clean, centred, frontal face (confidence ≥90; bbox centre cx 0.30–0.70, cy 0.24–0.74; width ≥0.20) and stores `face-refs/<uid>/reference.jpg` + sets `profiles.face_enrolled_at`; `want:'scan'` reports head-pose direction (up/down/left/right) for liveness. Admins may enroll/reset via `targetUserId`; `reset:true` deletes the reference + clears `face_enrolled_at`.
- **Punch verification:** `attendance-verify-punch` — DetectFaces quality gate (single, centred, front-facing; 6s timeout, never blocks on infra error) → CompareFaces vs reference (8s timeout) → maps similarity to `verified / no_match / unverified` (`attendanceGeo.mapVerification`) → uploads punch photo → calls `punch_attendance` RPC → updates `verification_status`. **Allow-and-flag**: always records; flags rather than blocks.
- **Face login:** `face-login` — resolves identifier → user → CompareFaces vs reference → issues magic-link `token_hash`. `verify_jwt=false` (pre-auth).
- **Capture UI:** `PlainCapture.tsx` (plain downscaled JPEG, no on-device model — cannot hang) is used in punch, enrollment, and login.

**Legacy (present, unused):** on-device `@vladmandic/human` via `faceEngine.ts` + `FaceCapture.tsx` + `useFaceEnrollment.ts` + `public/models/blazeface.*` + `faceres.*`.

**Threshold/config:** `attendance_settings.face_match_required` (bool) + `face_match_threshold` (default 0.90). Settings UI in `AttendanceSettingsSection.tsx` (off / photo / face; strictness slider 0.80–0.98).

---

## 20. Attendance System Overview

- **Purpose:** GPS-geofenced (+ optional face-verified) punch in/out. **Location:** `src/pages/attendance/`, `src/hooks/useAttendance.ts`, `src/lib/attendanceGeo.ts`. **Entry:** `/attendance`.
- **Main files:** `AttendancePage.tsx` (mode dispatcher), `FaceScanRing.tsx`, `PlainCapture.tsx`, `AttendancePhotosPage.tsx` (HR review), `FaceCapture.tsx` (legacy).
- **Tables:** `attendance_settings`, `attendance_punches`, `attendance_days` (view), `office_locations`. **RPC:** `punch_attendance`. **Edge fns:** `attendance-verify-punch`, `attendance-enroll-face`. **Storage:** `attendance`, `face-refs`.
- **Workflow:** settings determine mode (none/photo/face). GPS captured → `punch_attendance` computes haversine distance to nearest active office → records `within_fence`, `is_field`, `distance_m`. Face mode routes through the verify edge function first. First punch with no reference → guided ring enrollment.
- **Geofence policy (current, migrations 076→077):** face gate removed from the RPC (moved to edge/AWS); **office staff (non-`is_field`) are blocked outside the office radius**, field staff may punch anywhere; face is allow-and-flag.
- **Status:** Working (production). Idle-logout, geofence, enrollment ring, verification, and photo review all live.

---

## 21. Client Management Overview

- **Purpose:** manage client companies, FSSAI licences, portal credentials, documents. **Location:** `src/pages/clients/`. **Entry:** `/clients` → `/clients/:id`.
- **Main files:** `ClientsPage`, `ClientDetailPage`, `ClientForm`, `LicenseForm`, `CredentialReveal`, `ClientDocuments` (legacy).
- **Hooks/DB:** `useClients`, `useLicenses`, `useReferrals`; RPCs `store_fssai_credential`, `reveal_fssai_credential`, `delete_client`. Tables `clients`, `licenses`, `credential_access_log`, `referrals`.
- **Workflow:** create client (GSTIN real or placeholder `NOGSTN…`, PAN derived) → add licence(s) with issue/expiry → store portal password in **Supabase Vault** (reveal is manager+ and audit-logged, 30s auto-hide) → documents in Google Drive; expiry badges (safe/warn/urgent).
- **Status:** Working.

---

## 22. Employee Management Overview

- **Purpose:** staff directory + operational fields + sensitive PII. **Location:** `src/pages/employees/`. **Entry:** `/employees` → `/employees/:id`.
- **Hooks/DB:** `useEmployees`, `useEmployee`, `useEmployeeDetails`, `useUpsertEmployeeDetails`, `useUpdateEmployeeProfile`. Tables `profiles` (operational: employee_code, designation, department, hod_email, is_field_staff) + `employee_details` (sensitive PII — DOB, Aadhaar, PAN, addresses, emergency contact; strict RLS).
- **Workflow:** admin/HR set employment fields; employee (or HR/admin) fills personal details; password self-change (re-login required); attendance days shown on detail page.
- **Status:** Working.

---

## 23. Project Management Overview

- **Purpose:** FSSAI workflow engine with clocks, blocking, transfers, queries, SOI, payments. **Location:** `src/pages/projects/` (+ `tabs/`). **Entry:** `/projects` → `/projects/:id?tab=`.
- **Main files:** `ProjectsPage`, `ProjectDetailPage`, `ProjectForm`, `EditProjectModal`, `BlockRequestForm`, `ProjectTransfer`, `StageCard`, `StageAttachments`; tabs: `StagesTab`, `PaymentsTab`, `QueriesTab`, `SoiTab`, `DocumentsTab`, `RemarksTab`, `ActivityTab`.
- **Hooks/DB:** `useProjects`, `useProjectTransfers`, `useStageDocuments`, `usePayments`, `useAuthorityQueries`, `useDocuments`. Tables `projects`, `stages`, `stage_templates`, `stage_timeline`, `stage_documents`, `authority_queries`, `query_points`, `soi_archive`, `soi_products`, `payments`, `block_requests`, `cancel_requests`, `project_transfers`, `project_products`, `project_remarks`. RPCs `approve_block_request`, `unblock_project`, `approve_cancel_request`, `initiate/respond/cancel_project_transfer`, `delete_project`, `generate_artwork_product_stages`.
- **Workflow:** create → auto stages (template) → per-stage clock transitions (employee→client→authority) → block (6 types, manager approval, clock pauses) → transfers → payments rollup → query rounds (30-day) → SOI archive → completion (auto via `fn_sync_project_completion`). URL-persisted filters (status tabs, service type, scope, employee, due-date chips).
- **Status:** Working. Clocks refactored to per-stage.

---

## 24. Task Management Overview

- **Purpose:** assignable tasks with threads and extensions. **Location:** `src/pages/tasks/`, `src/hooks/useTasks.ts`. **Entry:** `/tasks`.
- **Tables:** `tasks` (task_code `TSK-NNNN`), `task_comments`, `task_extension_requests`. Triggers `tasks_stamp_completed`, `tasks_guard_update`; RPCs `request_task_extension`, `decide_task_extension`. Edge fn `urgent-alerts` (best-effort email on create/done/extension).
- **Workflow:** tabs (My / Assigned by me / All for managers), status changes (assignee can mark done, assigner/admin can edit), extension request → manager decision.
- **Status:** Working.

---

## 25. Payment Module Overview

- **Purpose:** track consulting + government fees per project. **Location:** `src/pages/projects/tabs/PaymentsTab.tsx`, `src/hooks/usePayments.ts`. Table `payments`; project rollup columns `quoted_amount`, `paid_amount`, `payment_status` (paise). Trigger `fn_recalc_project_payment`; RPC-driven mark-complete/unlock (migration 062).
- **Weekly reminder:** `notify-payment-weekly` edge fn (Monday) → WhatsApp summary of pending/partial payments to managers.
- **Status:** Working.

---

## 26. Reporting Module Overview

- **Purpose:** performance & operational analytics. **Location:** `src/pages/reports/PerformancePage.tsx`, `QueriesReportPage.tsx`. **Entry:** `/reports/performance`, `/reports/queries`.
- **Backing RPCs (migration 056):** `rpc_project_timeline`, `rpc_stage_performance`, `rpc_employee_timeline`, `rpc_ontime_report`, `rpc_employee_summary`; view `v_stage_timeline` (SECURITY INVOKER, migration 071). Access by role or `report_permissions` grant.
- **Status:** RPCs implemented; UI tabs present (some tab renderings not exhaustively verified — see Uncertainties).

---

## 27. Notification System Overview

- **In-app:** `notifications` table; real-time subscription (`useNotifications`), bell + panel (`NotificationPanel`), `/notifications` page; DB triggers create rows (project created/completed, stage assigned, block/cancel requests, `fn_notify_admins`).
- **WhatsApp (Meta Cloud API):** `send-whatsapp` dispatcher (config in `app_settings`: `whatsapp_enabled`, `whatsapp_api_key`, `whatsapp_phone_number_id`; logs to `whatsapp_log`). Templated messages must be authored in **"English (en)"** (en_US fails, error 132001). Dispatchers: `notify-dispatch` (polls `notifications`, ≤50/run), `block-escalate`, `notify-payment-weekly`, `daily-reminders`.
- **Email (ZeptoMail, India DC):** `daily-reminders` (09:00 IST morning digest: tasks/licences/queries), `urgent-alerts` (hourly: new tasks, completions, extensions, new projects), `test-mail`. Secrets `ZEPTOMAIL_TOKEN`, `MAIL_FROM`. Dedup via `notification_log`.
- **Status:** Working; WhatsApp gated by `app_settings.whatsapp_enabled`.

> Note: repository/global context references "Resend" for email, but the **code uses ZeptoMail**. Code is authoritative.

---

## 28. File Management Overview

- **Google Drive (primary):** `DriveTab.tsx` → `drive-ops` edge function (Drive API v3): create folder / Google Doc / Google Sheet, list, upload (file or folder via `webkitdirectory`), trash, download, and Workspace→PDF export. Auth via a Google service-account JSON stored in **Supabase Vault** (`get_google_sa_json` RPC) with domain-wide delegation (`DRIVE_SUB_EMAIL`); CORS restricted to `portal.tpsxpert.com`. Entity↔folder link via `set_entity_drive_folder`.
- **Supabase Storage:** avatars, documents, attendance selfies, face references (see §10).
- **Status:** Working.

---

## 29. Dashboard Overview

- **Dashboard (`/dashboard`):** my active/overdue projects, recent notifications, today's punches, pending payments, quick-add task (`TaskModal`); director KPIs for admins (`useDashboard`/`useDirectorStats`).
- **Director View (`/director`, super_admin/director):** KPI cards (active, completed, active clients, pending blocks), revenue (billed/quoted/pending), clock distribution, recent project pipeline.
- **Operations (`/operations`, manager+):** clock summary, block/unblock + cancel approval inbox, clock-bucket-filtered active projects.
- **Status:** Working.

---

## 30. Third-party Integrations

| Service | Use | Where |
|---|---|---|
| **Supabase** | DB, Auth, Storage, Edge Functions | entire backend |
| **AWS Rekognition** (ap-south-1) | Face detect/compare | `_shared/rekognition.ts`, enroll/verify/face-login |
| **Meta WhatsApp Cloud API** (v20.0) | Templated WhatsApp | `send-whatsapp` + dispatchers |
| **ZeptoMail** (Zoho, India DC) | Transactional email | `daily-reminders`, `urgent-alerts`, `test-mail` |
| **Google Drive API** (v3) | Document management | `drive-ops` |
| **Google Sheets** (Apps Script + edge) | Client sync | `sheets-sync`, `google-sheets/sync-clients.gs` |
| **GitHub Pages / Actions** | Hosting + CI/CD | `.github/workflows/deploy.yml` |
| **Google Fonts / Material Symbols** | Typography/icons | `index.html` |

---

## 31. API Summary (Edge Functions)

**13 edge functions** (HTTP endpoints) + 1 shared library (`_shared/rekognition.ts`, not an endpoint). The API surface below lists the shared library first for context, then the 13 functions.

| Function | Trigger | Auth | External | Key writes |
|---|---|---|---|---|
| `_shared/rekognition.ts` | library | n/a | AWS Rekognition | — |
| `attendance-enroll-face` | HTTP (frontend) | user JWT | AWS DetectFaces | `face-refs`, `profiles.face_enrolled_at` |
| `attendance-verify-punch` | HTTP (frontend) | user JWT | AWS Detect+CompareFaces | `attendance`, `attendance_punches` (via `punch_attendance`) |
| `face-login` | HTTP (login) | public (`verify_jwt=false`) | AWS CompareFaces | Auth magic link |
| `invite-user` | HTTP (admin) | user JWT (admin) | Supabase Auth | Auth user + `profiles` |
| `drive-ops` | HTTP (frontend) | user JWT | Google Drive | (Drive only) |
| `sheets-sync` | HTTP (Sheets) | `x-sync-token` | — | `clients` upsert |
| `send-whatsapp` | HTTP (internal/UI) | service key | Meta WhatsApp | `whatsapp_log` |
| `notify-dispatch` | pg_cron | public | Meta WhatsApp | `notifications.whatsapp_sent_at` |
| `block-escalate` | pg_cron | public | Meta WhatsApp | `notifications` |
| `notify-payment-weekly` | pg_cron | public | Meta WhatsApp | `notification_log` |
| `daily-reminders` | pg_cron | public | ZeptoMail + WhatsApp | `notification_log` |
| `urgent-alerts` | pg_cron | public | ZeptoMail | `notification_log` |
| `test-mail` | HTTP | public | ZeptoMail | — |

---

## 32. Database Summary

- **Extensions:** uuid-ossp, pg_cron, supabase_vault, moddatetime, pg_net.
- **Enums (11):** `user_role` (001), `clock_type` (001), `block_type` (001), `project_status` (001), `stage_status` (001), `payment_status` (001), `document_type` (001), `query_type` (001), `notification_type` (001), `client_document_category` = ('gst','pan','fssai','other') (009), `project_transfer_status` = ('pending','accepted','rejected','cancelled') (012).
- **Tables (40, exact — distinct `CREATE TABLE`):** app_settings, attendance_punches, attendance_settings, audit_log, authority_queries, block_requests, cancel_requests, client_documents, clients, code_counters, credential_access_log, delete_requests, documents, employee_details, knowledge_base, licenses, notification_log, notifications, office_locations, payments, performance_reports, profiles, project_products, project_remarks, project_transfers, projects, query_points, referrals, reminder_settings, soi_archive, soi_products, stage_audit_log, stage_documents, stage_templates, stage_timeline, stages, task_comments, task_extension_requests, tasks, whatsapp_log. *(`delete_requests` is a real table — `CREATE TABLE IF NOT EXISTS delete_requests` in migration `006_revamp.sql`.)*
- **Functions/RPCs (52, exact — distinct names):** auth/admin (`has_role`, `auth_role`, `admin_create_user`, `admin_reset_password`, `resolve_login_email`, `check_login_locked`, `record_login_attempt`); credentials (`store_fssai_credential`, `reveal_fssai_credential`); project lifecycle (`generate_project_code`, `delete_client`, `delete_project`, `generate_artwork_product_stages`); blocks (`approve_block_request`, `unblock_project`, `approve_cancel_request`); transfers (`initiate/respond/cancel_project_transfer`); attendance (`punch_attendance`); tasks (`request/decide_task_extension`, guards); payments (`fn_recalc_project_payment`, `fn_sync_project_completion`); notifications (`notify_project_created`, `fn_notify_*`); timeline/reporting (`trg_stage_timeline_capture`, `rpc_project_timeline`, `rpc_stage_performance`, `rpc_employee_timeline`, `rpc_ontime_report`, `rpc_employee_summary`); codes (`generate_query_code`, `generate_task_code`, `fn_set_client_code`); workflow (`create_stages_from_template`, `fn_add_working_days`); drive (`set_entity_drive_folder`). *(52 = count of distinct function names across all migrations, including trigger functions.)*
- **Triggers (27, exact — distinct names):** `moddatetime` on updated_at (profiles/clients/licenses/projects/stages/knowledge_base/tasks); code generators (project/client/query/task); `create_stages_from_template` + `create_initial_timeline` on project/stage insert; `trg_stage_timeline_capture` + reassign/assigned_at; `fn_recalc_project_payment` + `fn_sync_project_completion`; notification triggers (project/block/cancel); `fn_audit_stage_changes`; task guards/completion stamps.
- **Views (2):** `attendance_days`, `v_stage_timeline` (both SECURITY INVOKER).
- **RLS:** enabled on all tables; role-based via `has_role()` with owner fallbacks; single-row settings readable by authenticated, writable by director+.
- **CAPA hardening (071–074):** view→SECURITY INVOKER + `search_path=public` on 11 functions (071); scoped RLS replacing `USING(true)` on cancel_requests/delete_requests/query_points/soi_products (072); 45 FK covering indexes (073); drop duplicate index + revoke anon EXECUTE on 4 admin RPCs (074).

---

## 33. Security Features

- **RLS** on all tables; **SECURITY DEFINER** RPCs with pinned `search_path=public` (071) for privileged actions; anon EXECUTE revoked on admin RPCs (074).
- **Credential vault** (Supabase Vault) for FSSAI portal passwords; reveals are role-gated and **audit-logged** (`credential_access_log`).
- **Brute-force lockout** on login (5/15 min).
- **Idle auto-logout** (15 min).
- **Private storage** (documents/attendance/face-refs) with signed URLs; `face-refs` readable only by owner + manager+.
- **Edge function auth:** user-JWT-verified functions (enroll/verify/drive/invite) vs deliberately public ones (face-login pre-auth, cron dispatchers, token-guarded sheets-sync).
- **CORS** restriction to `portal.tpsxpert.com` on `drive-ops`.
- **Privilege-escalation guards:** only super_admin can mint super_admin (`invite-user`, `admin_create_user`).
- **Secrets** kept in Supabase Edge secrets / Vault / `app_settings` — never in the repo (`.env.local` gitignored; only `VITE_*` public keys reach the client).

---

## 34. Logging Features

- **Application audit tables:** `audit_log`, `stage_audit_log`, `credential_access_log`, `whatsapp_log`, `notification_log`.
- **Platform logs:** Supabase edge-function logs, Postgres logs, storage logs (observed during operations; not a repo artifact).
- **Client:** `ErrorBoundary` (dev shows stack, prod shows generic + reload).
- **No external log aggregation** in the repository.

---

## 35. Monitoring Features

- **Not Implemented** in the repository (no Sentry/Datadog/APM/uptime config). Operational visibility is via Supabase dashboards/logs and the DB audit tables above.

---

## 36. Deployment Summary

- **CI/CD:** `.github/workflows/deploy.yml` — on push to `main` (or manual dispatch): checkout → Node 24 → `npm ci` → `tsc --noEmit` (type check) → `npm test -- --run` (Vitest, with placeholder Supabase env) → `npm run build` (injects `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` from secrets; `VITE_APP_NAME`, `VITE_APP_URL` inline) → upload Pages artifact → deploy to GitHub Pages.
- **Domain:** `public/CNAME` = `portal.tpsxpert.com`.
- **SPA routing on Pages:** `public/404.html` saves deep-link to sessionStorage; `index.html` restores it.
- **Manual path (package.json):** `predeploy`→`build`, `deploy`→`gh-pages -d dist` (secondary; primary is GitHub Actions).
- **Edge functions/migrations:** deployed to Supabase out-of-band (Supabase CLI/MCP), not via this Pages workflow.

---

## 37. Configuration Summary

- **Vite** (`vite.config.ts`): React plugin, `@`→`src`, `base:'/'`.
- **Vitest** (`vitest.config.ts`): node environment, `src/**/*.test.ts`.
- **Tailwind** (`tailwind.config.ts`): brand scale (navy #004c6e primary, green #10B981 success), clock colors, fonts (Manrope/Inter/JetBrains Mono), custom animations.
- **PostCSS**: tailwindcss + autoprefixer.
- **TypeScript**: project references (`tsconfig.app.json`, `tsconfig.node.json`).
- **App config in DB:** `app_settings` (whatsapp_enabled, drive folder), `attendance_settings` (singleton), `reminder_settings`.

---

## 38. Environment Variables Used (names only — no values)

**Frontend (`VITE_*`, build-time, public):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — the **only two `VITE_*` vars referenced in `src/`** (verified by grep). `VITE_APP_NAME` and `VITE_APP_URL` are declared in `.env.example` and injected by CI (`deploy.yml`) but are **not referenced anywhere in `src/` or `index.html`** (declared, currently unused in code).

**Edge function secrets (server-side, names only):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `ZEPTOMAIL_TOKEN`, `MAIL_FROM`, `DRIVE_SUB_EMAIL`, `SITE_URL`, `SHEETS_SYNC_TOKEN`.

**Config stored in DB (not env):** `app_settings.whatsapp_api_key`, `app_settings.whatsapp_phone_number_id`, `app_settings.whatsapp_enabled`; Google service-account JSON in Supabase Vault (via `get_google_sa_json`).

**CI secrets (`deploy.yml`):** `secrets.VITE_SUPABASE_URL`, `secrets.VITE_SUPABASE_ANON_KEY`.

> No secret values are stored in the repository; `.env.local` is gitignored, `.env.example` contains placeholders only.

---

## 39. External Services Connected

Supabase (DB/Auth/Storage/Edge), AWS Rekognition, Meta WhatsApp Cloud API, ZeptoMail, Google Drive API, Google Sheets, GitHub Pages/Actions, Google Fonts + Material Symbols. (Details in §30.)

---

## 40. Overall Project Statistics

| Metric | Value (exact) |
|---|---|
| Total source files (excl node_modules/.git/dist) | **226** (222 git-tracked; 4 untracked incl. this doc & `.env.local`) |
| Folders | **62** |
| Frontend TS/TSX LOC | **19,520** |
| Edge-function TS LOC | **1,855** |
| SQL migration LOC | **5,409** |
| SQL migrations | **77** (001–077) |
| Page components (`src/pages/**/*.tsx`) | **45** |
| Layout + shared components | **11** (4 layout + 7 shared) |
| React hooks (`src/hooks/*.ts`) | **20** |
| Lib modules (`src/lib/*.ts`, excl tests) | **5** |
| Edge functions | **13** (+1 shared library `_shared/rekognition.ts`) |
| Route paths (`<Route path=…>`) | **22** (+1 `index` redirect; 24 `<Route>` elements total) |
| DB tables (distinct CREATE TABLE) | **40** |
| DB enums (CREATE TYPE … AS ENUM) | **11** |
| DB functions/RPCs (distinct names) | **52** |
| DB triggers (distinct names) | **27** |
| DB views | **2** |
| Storage buckets | **4** |
| Unit-test files | **2** |
| User roles | **7** |
| `VITE_*` vars referenced in `src/` | **2** (of 4 declared) |
| Git commits | **202** (`git rev-list --count HEAD`) |

---

## Per-Module Quick Reference

| Module | Location | Entry | Key backend | Status |
|---|---|---|---|---|
| Auth/Login | pages/auth | /login | RPCs resolve_login_email/check_login_locked; face-login fn | Working |
| Attendance | pages/attendance | /attendance | punch_attendance; enroll/verify fns; attendance/face-refs buckets | Working |
| Clients | pages/clients | /clients | clients/licenses; vault RPCs; delete_client | Working |
| Projects | pages/projects | /projects | stages/timeline/payments/queries/soi; many RPCs/triggers | Working |
| Employees | pages/employees | /employees | profiles + employee_details | Working |
| Tasks | pages/tasks | /tasks | tasks + comments + extensions; urgent-alerts | Working |
| Dashboard | pages/dashboard | /dashboard | projects/notifications/stats | Working |
| Director | pages/director | /director | director stats + pipeline | Working |
| Operations | pages/operations | /operations | active projects + approval inbox | Working |
| Notifications | pages/notifications | /notifications | notifications (realtime) | Working |
| Reports | pages/reports | /reports/* | 056 reporting RPCs; v_stage_timeline | RPCs done; UI partly verified |
| Referrals | pages/referrals | /referrals | referrals/referral rollup | Working |
| Knowledge | pages/knowledge | /knowledge | knowledge_base | UI present; CRUD not fully verified |
| Settings | pages/settings | /settings | attendance_settings/app_settings/reminder_settings | Working |
| User Mgmt | pages/admin | /admin/users | invite-user; admin_reset_password; useResetFace | Working |

---

## END REPORT — Inspection Accounting

**1. Total files inspected**
**226** non-vendor source files enumerated (222 git-tracked + 4 untracked incl. this document and `.env.local`). Content-inspected (read directly by the lead or by the five read-only subagents): all `.ts`, `.tsx`, `.sql`, `.mjs`, `.gs`, `.js`, `.css`, `.html`, `.yml`, `.json` config, and `.md` files driving the app. The 77 migrations, 13 edge functions (+shared lib), 45 pages, 20 hooks, 5 libs, 11 components, all types, and every root config were inspected.

**2. Total folders inspected**
**62** folders enumerated and traversed (excluding `node_modules/`, `.git/`, `dist/`).

**3. Files skipped (content not read line-by-line)**
- `public/models/blazeface.bin`, `blazeface.json`, `faceres.bin`, `faceres.json` — binary/weights of the **legacy** on-device model (metadata/sizes noted; not decoded).
- `public/logo.png` — binary image.
- `package-lock.json` (237 KB) — dependency lockfile (dependencies read from `package.json`).
- `tsconfig.app.tsbuildinfo`, `tsconfig.node.tsbuildinfo` — generated build caches.
- `.DS_Store` (root, `public/`) — macOS OS metadata.
- `dist/` — generated build output (excluded by scope).
- `node_modules/`, `.git/` — vendor/VCS internals (excluded by scope).

**4. Reason for skipping**
Binary/generated/vendor/OS-metadata files carry no authored source and are not meaningfully inspectable as text; dependency and build-cache files are derivable from `package.json`/build.

**5. Uncertainties found**
- **Idle-logout copy mismatch:** `src/hooks/useIdleLogout.ts` — timeout constant is 15 min but the toast message text still reads "…after 30 minutes of inactivity." (cosmetic; documented, **not fixed** per instructions).
- **Legacy face path:** `FaceCapture.tsx` / `faceEngine.ts` / `useFaceEnrollment.ts` and `public/models/*` are present and unit-tested but **unused** in the active flow; `profiles.face_descriptor` / `face_model` are legacy columns no longer populated by the current server-side enrollment.
- **Reports/Knowledge UI:** backing RPCs (056) exist and pages render, but not every report/knowledge tab's data rendering was individually traced.
- **`xlsx` usage sites** (Excel export) were not exhaustively enumerated; the dependency is present.
- **pg_cron schedules:** migrations (004/028) seed reminder cron; the live database contains additional cron jobs invoking the dispatcher edge functions (observed operationally). Only repo-defined schedules are authoritative here.
- **Email provider:** code uses **ZeptoMail** (authoritative), while some project context references "Resend."

**Resolved during verification (previously uncertain):**
- `delete_requests` **is** a real table — `CREATE TABLE IF NOT EXISTS delete_requests` confirmed in `supabase/migrations/006_revamp.sql`.
- **Git commit count = 202** — `git rev-list --count HEAD` completed (the earlier `git log` timeout truncation caused the prior "~20" estimate).

**6. Confirmation of coverage**
**100% of the repository's authored source files were enumerated and inspected** (directly or via read-only subagents). Binary, generated, lockfile, OS-metadata, and vendor files were enumerated but intentionally not content-read for the reasons in item 4. No files were modified, created (other than this document), refactored, or fixed during inspection.

---

*Generated by read-only repository inspection. Code is authoritative; where documentation or external context conflicts with source, this document reflects the source.*
