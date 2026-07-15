# TPS-OMS — API Reference (06)

**Purpose:** Reference for all callable interfaces — Edge Functions (HTTP), database RPCs, PostgREST table access, and Storage.
**Scope:** API surface only. Implementation internals in Docs 04/05; security in Doc 07.
**Related Documents:** `02_SYSTEM_ARCHITECTURE.md`, `04_MODULE_DOCUMENTATION.md`, `05_DATABASE_DOCUMENTATION.md`, `07_SECURITY_AUDIT.md`.
**Version:** 1.0 · **Creation Date:** 2026-07-14 · **Last Verification Date:** 2026-07-14
**Repository Branch:** `main` · **Commit Hash:** `9558f90` (working tree; docs uncommitted)

> Base URLs: PostgREST/RPC/Storage/Functions all under the Supabase project URL (`VITE_SUPABASE_URL`). Functions path: `/functions/v1/<name>`. All requests carry the Supabase anon key + (when logged in) the user JWT via `@supabase/supabase-js`. Payloads/responses are from actual edge-function and hook source.

## Table of Contents
1. Access Styles
2. Edge Function APIs (13)
3. Callable Database RPCs
4. PostgREST Table Access
5. Storage API Usage
6. Error Conventions

---

## 1. Access Styles

Three call styles through one client (`src/lib/supabase.ts`):
- `supabase.from(table)…` → **PostgREST** (RLS-enforced).
- `supabase.rpc(fn, args)` → **RPC** (PL/pgSQL, many SECURITY DEFINER).
- `supabase.functions.invoke(name, { body })` → **Edge Functions**.
- `supabase.storage.from(bucket)…` → **Storage**.

## 2. Edge Function APIs (13)

`_shared/rekognition.ts` is a library (not an endpoint). Auth column reflects the code's own check (`verify_jwt` and/or manual JWT/token validation).

### 2.1 `attendance-enroll-face`
- **Invoked from:** `useFaceVerify.ts` (`enrollFrame`, `useEnrollFace`, `useResetFace`). **Auth:** user JWT.
- **Body:** `{ photo?: base64, want?: 'center'|'scan', targetUserId?: uuid, reset?: boolean }`
- **Behavior:** `want:'center'` validates frontal face (AWS DetectFaces, confidence ≥90, centre/size gates) → stores `face-refs/<subject>/reference.jpg` + sets `profiles.face_enrolled_at`; `want:'scan'` returns `{ detected, matched }`; `reset:true` removes reference + clears flag. Admin may pass `targetUserId`.
- **Response:** `{ ok, matched, detected?, savedReference?, reason?, reset? }`.

### 2.2 `attendance-verify-punch`
- **Invoked from:** `useVerifiedPunch`. **Auth:** user JWT.
- **Body:** `{ photo: base64, gps: { lat, lng, accuracy } }`
- **Behavior:** DetectFaces quality gate (6s) → CompareFaces vs reference (8s) → maps status → uploads punch photo (`attendance`) → calls `punch_attendance` (forwards user JWT) → updates `verification_status`. Allow-and-flag.
- **Response:** `{ ok, status?: 'verified'|'no_match'|'unverified', similarity?, needs_enrollment?, needs_retake?, reason? }`.

### 2.3 `face-login`
- **Invoked from:** `LoginPage.tsx`. **Auth:** public (`verify_jwt=false`).
- **Body:** `{ identifier: email|employee_code, photo: base64 }`
- **Behavior:** resolve user → CompareFaces vs reference → `admin.generateLink(magiclink)`.
- **Response:** `{ token_hash, score }` or `{ error }`.

### 2.4 `invite-user`
- **Invoked from:** `UserManagementPage.tsx`. **Auth:** user JWT + caller role check (super_admin/director/hr).
- **Body:** `{ email, name, role, mode?: 'invite'|'create', password?, phone?, whatsapp_number? }`
- **Behavior:** `invite` → `inviteUserByEmail`; `create` → `createUser` (email verified). Upserts `profiles`. Guard: only super_admin mints super_admin.
- **Response:** success/error JSON.

### 2.5 `drive-ops`
- **Invoked from:** `useDrive`/`DriveTab.tsx`. **Auth:** user JWT (auditor read-only). **CORS:** `portal.tpsxpert.com`.
- **Body:** `{ action: 'create-folder'|'create-gdoc'|'create-gsheet'|'list-files'|'trash'|'upload'|'download', … }`
- **Behavior:** Google Drive API v3 via Vault service-account JWT (`get_google_sa_json`, `DRIVE_SUB_EMAIL`); Workspace→PDF export on download.
- **Response:** action-specific JSON (files, IDs, base64 content).

### 2.6 `sheets-sync`
- **Invoked from:** Google Sheets (Apps Script). **Auth:** `x-sync-token` header = `SHEETS_SYNC_TOKEN`.
- **GET `?action=pull`:** returns clients + primary licence. **POST `?action=push`:** upserts clients on `gstin`.
- **Response:** `{ clients }` / `{ imported, skipped, errors }`; 401 on token mismatch.

### 2.7 `send-whatsapp`
- **Invoked from:** other edge fns + `WhatsAppTesterSection`. **Auth:** service key (public endpoint; callers hold service role).
- **Body:** `{ phone, template, params[], refId? }`
- **Behavior:** Meta WhatsApp Cloud API v20; config from `app_settings`; logs `whatsapp_log`.
- **Response:** Meta response; 200 ok / 502 on Meta error.

### 2.8 `notify-dispatch` (pg_cron, public)
Polls unsent `notifications` (WA types, ≤50), maps type→template, calls `send-whatsapp`, marks `whatsapp_sent_at`.

### 2.9 `block-escalate` (pg_cron, public)
Finds block_requests unapproved >4h → WhatsApp to managers + in-app notification.

### 2.10 `notify-payment-weekly` (pg_cron, public)
Monday: WhatsApp payment summary (pending/partial) to managers; dedup `notification_log`.

### 2.11 `daily-reminders` (pg_cron, public)
09:00 IST digest (tasks/licences/queries) via ZeptoMail + WhatsApp; test mode `{test:true,to,name}`.

### 2.12 `urgent-alerts` (pg_cron, public)
Hourly email (new tasks, completions, extensions, new projects) via ZeptoMail; test mode.

### 2.13 `test-mail` (public)
One-shot ZeptoMail test to `to` (default tarun@tpsxpert.com).

## 3. Callable Database RPCs (client-invoked)

Signatures verified from source where noted; others per migration inspection.

| RPC | Args | Security | Invoked from |
|---|---|---|---|
| `check_login_locked` | `p_identifier text` | DEFINER | LoginPage |
| `resolve_login_email` | `p_identifier text` | DEFINER | LoginPage |
| `record_login_attempt` | `p_identifier text, p_success bool` | DEFINER | LoginPage |
| `punch_attendance` | `p_lat, p_lng, p_accuracy double, p_selfie_path text, p_device text, p_face_matched bool, p_face_score numeric` → jsonb | DEFINER | attendance-verify-punch / doPunch (verified) |
| `store_fssai_credential` | `p_license_id uuid, p_username text, p_password text, p_reason text` | DEFINER | useLicenses |
| `reveal_fssai_credential` | `p_license_id uuid, p_reason text` → text | DEFINER | CredentialReveal |
| `admin_reset_password` | `p_user_id uuid, p_new_password text` | DEFINER | UserManagementPage |
| `approve_block_request` | `p_request_id uuid, p_approved bool, p_note text` | DEFINER | Operations |
| `unblock_project` | `p_project_id uuid` | DEFINER | ProjectDetail |
| `approve_cancel_request` | `p_request_id uuid, p_approved bool, p_note text` | DEFINER | Operations |
| `initiate_project_transfer` | `p_project_id uuid, p_to_user_id uuid, p_notes text` → uuid | DEFINER | ProjectTransfer |
| `respond_project_transfer` | `p_transfer_id uuid, p_accepted bool, p_notes text` | DEFINER | ProjectTransfer |
| `cancel_project_transfer` | `p_transfer_id uuid` | DEFINER | ProjectTransfer |
| `delete_client` | `p_client_id uuid` | DEFINER | ClientDetail |
| `delete_project` | `p_project_id uuid` | DEFINER | ProjectDetail |
| `request_task_extension` | `p_task_id uuid, p_days int, p_reason text` | DEFINER | Tasks |
| `decide_task_extension` | `p_request_id uuid, p_approve bool` | DEFINER | Tasks |
| `rpc_project_timeline` / `rpc_stage_performance` / `rpc_employee_timeline` / `rpc_ontime_report` / `rpc_employee_summary` | reporting args | DEFINER | Reports |

`admin_create_user` and `generate_artwork_product_stages` exist as DEFINER RPCs; `admin_create_user` anon EXECUTE revoked (074). Exact arg lists for reporting RPCs are in migration 056.

## 4. PostgREST Table Access

Hooks use `supabase.from('<table>')` with standard `.select/.insert/.update/.delete`. Access is filtered by RLS (Doc 05 §8). Representative reads: `useClients` (clients), `useProjects` (projects+clients+profiles+stages), `useTasks` (tasks+joins), `useNotifications` (notifications + realtime), `useAttendance` (attendance_settings/attendance_punches/attendance_days/office_locations).

## 5. Storage API Usage

| Bucket | Operation | Caller |
|---|---|---|
| `avatars` | upload/getPublicUrl | TopBar |
| `attendance` | upload (edge) / createSignedUrls | verify-punch / AttendancePhotosPage |
| `face-refs` | upload/download/remove (edge) | enroll/verify/reset |
| `documents` | upload/list/remove | ClientDocuments (legacy) / stage docs |

## 6. Error Conventions

- **Edge functions:** JSON `{ error: string }` with HTTP 4xx/5xx; timeouts resolve to non-blocking flags (`needs_retake`, `unverified`). `useFaceVerify.invoke()` parses the error body.
- **RPC:** `raise exception '...'` → PostgREST error → hook error → `Toast.error`.
- **PostgREST:** RLS denial returns 0 rows or permission error (not an exception).

---

*Grounded in source at commit `9558f90`. No application code modified. Reporting-RPC exact arguments: see `supabase/migrations/056_reporting_views.sql`.*
