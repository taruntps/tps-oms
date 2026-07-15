# TPS-OMS — Decision Log (12)

**Purpose:** Record the architectural/technical decisions **observable in the source and migration history** (ADR-style). Each entry is inferred only from concrete evidence in the repository.
**Scope:** Decisions evidenced by code/migrations. Decisions made only in discussion (not reflected in source) are **Not Verifiable from Source Code**.
**Related Documents:** `02_SYSTEM_ARCHITECTURE.md`, `05_DATABASE_DOCUMENTATION.md`, `07_SECURITY_AUDIT.md`.
**Version:** 1.0 · **Creation Date:** 2026-07-14 · **Last Verification Date:** 2026-07-14
**Repository Branch:** `main` · **Commit Hash:** `9558f90` (working tree; docs uncommitted)

> Status legend: **Active** (current), **Superseded** (replaced by a later decision, evidence retained), **Legacy** (retained but unused).

## Table of Contents
- ADR-001 Serverless BaaS + SPA
- ADR-002 Database-enforced authorization (RLS)
- ADR-003 Edge functions for external/privileged I/O
- ADR-004 On-device face → server-side AWS Rekognition
- ADR-005 Attendance "allow-and-flag" + geofence policy
- ADR-006 Money in paise; auto business codes
- ADR-007 Google Drive as primary document store
- ADR-008 Email via ZeptoMail; WhatsApp via Meta Cloud API
- ADR-009 Per-stage clocks (timeline capture)
- ADR-010 Remember-me session storage strategy
- ADR-011 CI: typecheck + test + build gate; Pages hosting
- ADR-012 CAPA-driven security hardening
- ADR-013 Employee code login + brute-force lockout

---

### ADR-001 — Serverless BaaS + SPA
- **Context:** No backend server in the tree; SPA calls Supabase directly.
- **Decision:** Use Supabase (DB/Auth/Storage/Edge) as the entire backend; React/Vite SPA on GitHub Pages.
- **Evidence:** `src/lib/supabase.ts`, `supabase/**`, `.github/workflows/deploy.yml`, `public/CNAME`.
- **Status:** Active.

### ADR-002 — Database-enforced authorization (RLS)
- **Decision:** Enforce authorization at PostgreSQL via RLS + `has_role()`/SECURITY DEFINER RPCs; client route-guards are UX-only.
- **Evidence:** migrations 003/013/051/052/072/074; `ProtectedRoute.tsx` (comment noting the guard is advisory).
- **Status:** Active.

### ADR-003 — Edge functions for external/privileged I/O
- **Decision:** Isolate AWS/WhatsApp/email/Google/admin operations into Deno edge functions with explicit auth posture.
- **Evidence:** `supabase/functions/*` (13 functions).
- **Status:** Active.

### ADR-004 — On-device face → server-side AWS Rekognition
- **Context:** On-device `@vladmandic/human` engine could hang on slow WebGL init.
- **Decision:** Move face detection/matching server-side to AWS Rekognition; capture a plain photo client-side.
- **Evidence:** `_shared/rekognition.ts`, `attendance-enroll-face`, `attendance-verify-punch`, `face-login`, `PlainCapture.tsx`; legacy `faceEngine.ts`/`FaceCapture.tsx`/`public/models/*` retained.
- **Status:** Active (server-side); **Superseded** on-device path is **Legacy**.

### ADR-005 — Attendance "allow-and-flag" + geofence policy
- **Context:** Migration history 019 → 043/045 (face-descriptor gate) → 076 (remove face gate; allow-and-flag) → 077 (restore geofence block for office staff).
- **Decision:** Face never blocks a punch (records verified/no_match/unverified); office staff blocked outside geofence; field staff exempt.
- **Evidence:** migrations 076, 077; `punch_attendance` RPC; `attendance-verify-punch`.
- **Status:** Active (076 superseded the earlier face-descriptor gate; 077 re-added geofence).

### ADR-006 — Money in paise; auto business codes
- **Decision:** Store money as integer paise; auto-generate `TPS-YYYY-NNNN`/`TPS-CLI-NNNN`/`TSK-NNNN`/`QRY-NNNN` via triggers.
- **Evidence:** migrations 002/009/010/037/058; `generate_project_code`, `fn_set_client_code`.
- **Status:** Active.

### ADR-007 — Google Drive as primary document store
- **Decision:** Use Google Drive (via `drive-ops` + Vault service account) for client/project documents; keep Supabase `documents` bucket as legacy.
- **Evidence:** `drive-ops`, `DriveTab.tsx`, `set_entity_drive_folder` (048); `ClientDocuments.tsx` legacy.
- **Status:** Active (Drive); legacy bucket retained.

### ADR-008 — Email via ZeptoMail; WhatsApp via Meta Cloud API
- **Decision:** Transactional email through ZeptoMail; WhatsApp through Meta Cloud API with templates in "English (en)".
- **Evidence:** `daily-reminders`/`urgent-alerts`/`test-mail` (`ZEPTOMAIL_TOKEN`); `send-whatsapp` (Meta v20, `app_settings`).
- **Status:** Active. *(Note: some project context references "Resend"; code uses ZeptoMail — code authoritative.)*

### ADR-009 — Per-stage clocks (timeline capture)
- **Context:** Clocks refactored from project-level to per-stage.
- **Decision:** Track `active_clock` per stage; append-only `stage_timeline` via trigger.
- **Evidence:** migrations 031/055; `trg_stage_timeline_capture`; `src/lib/projectClock.ts`.
- **Status:** Active (superseded earlier project-level clock).

### ADR-010 — Remember-me session storage strategy
- **Decision:** Persist session in `localStorage` by default, `sessionStorage` when "remember me" is off, via a custom storage adapter; 15-min idle logout regardless.
- **Evidence:** `src/lib/supabase.ts` (`rememberStorage`), `useIdleLogout.ts`.
- **Status:** Active.

### ADR-011 — CI: typecheck + test + build gate; Pages hosting
- **Decision:** GitHub Actions gates deploys on `tsc --noEmit` + `vitest` before `vite build`; deploy to GitHub Pages; migrations/edge deployed out-of-band.
- **Evidence:** `.github/workflows/deploy.yml`.
- **Status:** Active.

### ADR-012 — CAPA-driven security hardening
- **Decision:** Apply a batch of security/perf hardening (view→INVOKER, search_path pinning, scoped RLS, FK indexes, anon revokes).
- **Evidence:** migrations 071–074.
- **Status:** Active.

### ADR-013 — Employee-code login + brute-force lockout
- **Decision:** Allow login by employee code (resolved to email) and lock accounts after 5 failures/15 min.
- **Evidence:** migrations 021/023/024; `resolve_login_email`, `check_login_locked`, `record_login_attempt`; `LoginPage.tsx`.
- **Status:** Active.

---

## Decisions Not Verifiable from Source Code

The following are plausible product/architecture decisions whose rationale is **not** recorded in source (only outcomes are): choice of Supabase vs alternatives, AWS region selection, WhatsApp BSP choice, GitHub Pages vs other hosting, and the geofence radius value (a data/config value, not code). These are marked **Not Verifiable from Source Code** as *decisions* (their *effects* are documented above where evidenced).

---

*Grounded in source + migration history at commit `9558f90`. No application code modified.*
