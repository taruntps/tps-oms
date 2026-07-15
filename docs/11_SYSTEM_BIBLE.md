# TPS-OMS — System Bible (11)

**Purpose:** The consolidated master reference — a single authoritative snapshot of the entire system with cross-links to Docs 01–10 and 12. Use this as the entry point.
**Scope:** Whole system (index + consolidated quick-reference). Details live in the referenced documents.
**Related Documents:** all of `01`–`10`, `12`.
**Version:** 1.0 · **Creation Date:** 2026-07-14 · **Last Verification Date:** 2026-07-14
**Repository Branch:** `main` · **Commit Hash:** `9558f90` (working tree; docs uncommitted)

## Table of Contents
1. What This System Is
2. Documentation Map
3. Technology Stack (canonical)
4. Repository Statistics (exact)
5. All Routes
6. All Edge Functions
7. All Database Tables (40)
8. All Enums (11)
9. Storage Buckets
10. Roles & Key Permissions
11. Key Business Flows (index)
12. Active vs Legacy (canonical list)
13. External Integrations
14. Glossary
15. Source-of-Truth Rules

---

## 1. What This System Is

**TPS-OMS** (TPS Xperts Portal) is a serverless React SPA for an FSSAI/food-safety consultancy, hosted on GitHub Pages, backed by Supabase (PostgreSQL + Auth + Storage + 13 Deno Edge Functions). It manages clients→licences→projects (multi-stage workflow with clocks)→payments/queries/SOI, plus attendance (geofence + AWS face), tasks, notifications (in-app/WhatsApp/email), reporting, and admin. Security is enforced at the database via RLS + SECURITY DEFINER RPCs.

## 2. Documentation Map

| Doc | Title | Use for |
|---|---|---|
| 01 | Project Inventory | complete file/asset/module inventory + exact stats |
| 02 | System Architecture | layers, flows, 21 diagrams |
| 03 | Business Workflows | operational processes |
| 04 | Module Documentation | per-module internals |
| 05 | Database Documentation | tables/enums/functions/triggers/RLS |
| 06 | API Reference | edge fns, RPCs, PostgREST, storage |
| 07 | Security Audit | controls + gaps |
| 08 | Deployment & Infrastructure | build/CI/CD/hosting |
| 09 | Production Readiness | readiness scorecard |
| 10 | Gap Analysis | gaps/legacy/inconsistencies |
| 11 | System Bible | this consolidated index |
| 12 | Decision Log | architectural decisions observed |

## 3. Technology Stack (canonical)

React 18.3 · Vite 5.4 · TypeScript 5.5 · React Router 6.26 · TanStack Query 5.56 + Table 8.20 · TailwindCSS 3.4 + Radix UI · react-hook-form 7.53 + zod 3.23 · xlsx 0.18 · @vladmandic/human 3.3 (legacy) · Vitest 4.1 · @supabase/supabase-js 2.45. Backend: Supabase PostgreSQL 17, Deno edge runtime. Hosting: GitHub Pages + Actions.

## 4. Repository Statistics (exact — see Doc 01 §40)

226 files · 62 folders · 77 migrations · 13 edge functions (+1 shared lib) · 45 pages · 11 components · 20 hooks · 5 libs · 2 tests · 40 tables · 11 enums · 52 functions · 27 triggers · 2 views · 4 buckets · 7 roles · 202 commits · LOC 19,520 (frontend) / 1,855 (edge) / 5,409 (SQL).

## 5. All Routes (`src/App.tsx`)

`/login` (public) · `/` (index→RoleBasedRedirect) · `/dashboard` · `/director` [super_admin,director] · `/operations` · `/attendance` · `/attendance/photos` [super_admin,director,manager,hr] · `/tasks` · `/notifications` · `/clients` · `/clients/:id` · `/referrals` [super_admin,director,manager] · `/projects` · `/projects/:id` · `/employees` [super_admin,director,manager,hr] · `/employees/:id` [+executive,accounts,auditor] · `/knowledge` · `/reports/performance` · `/reports/queries` [super_admin,director,manager] · `/settings` [super_admin,director] · `/admin/users` [super_admin,director] · `*`→`/`.

## 6. All Edge Functions (13)

`attendance-enroll-face`, `attendance-verify-punch`, `face-login`, `invite-user`, `drive-ops`, `sheets-sync`, `send-whatsapp`, `notify-dispatch`, `block-escalate`, `notify-payment-weekly`, `daily-reminders`, `urgent-alerts`, `test-mail`. Shared lib: `_shared/rekognition.ts`. (Details: Doc 06 §2.)

## 7. All Database Tables (40)

profiles, employee_details, clients, licenses, credential_access_log, client_documents, referrals, projects, code_counters, project_products, project_remarks, stages, stage_templates, stage_timeline, stage_documents, authority_queries, query_points, soi_archive, soi_products, payments, block_requests, documents, notifications, notification_log, knowledge_base, performance_reports, stage_audit_log, audit_log, cancel_requests, delete_requests, office_locations, attendance_settings, attendance_punches, tasks, task_comments, task_extension_requests, reminder_settings, app_settings, whatsapp_log, project_transfers. (Details: Doc 05 §4.)

## 8. All Enums (11)

user_role, clock_type, block_type, project_status, stage_status, payment_status, document_type, query_type, notification_type, client_document_category, project_transfer_status. (Values: Doc 05 §3.)

## 9. Storage Buckets

`avatars` (public, 015), `attendance` (private, 019), `face-refs` (private, 075), `documents` (private; policy-referenced, creation not in migrations).

## 10. Roles & Key Permissions

7 roles: super_admin, director, manager, executive, accounts, hr, auditor. Payment/close/credentials/assign/approve-blocks gated to super_admin/director/manager (+accounts for payments). Full matrix: Doc 07 §4.

## 11. Key Business Flows (index → Doc 03)

Client onboarding · Credential vault · Project lifecycle · Stage clocks · Block/unblock · Transfer · Cancellation · Authority query rounds · SOI archive · Payment rollup · Task lifecycle · Attendance punch · Face enrollment · Face login · Notification dispatch · Referral tracking.

## 12. Active vs Legacy (canonical)

- **Active face path:** `PlainCapture` + `attendance-enroll-face`/`attendance-verify-punch`/`face-login` + `_shared/rekognition.ts` + `face-refs` bucket + `profiles.face_enrolled_at`.
- **Legacy face path (present, unused):** `faceEngine.ts`, `FaceCapture.tsx`, `useFaceEnrollment.ts`, `public/models/*`, `profiles.face_descriptor`/`face_model`.
- **Legacy doc path:** `ClientDocuments.tsx` + `documents` bucket (superseded by Google Drive).

## 13. External Integrations

Supabase (BaaS) · AWS Rekognition ap-south-1 (face) · Meta WhatsApp Cloud API v20 · ZeptoMail (email) · Google Drive API v3 · Google Sheets · GitHub Pages/Actions. (Details: Doc 02 §37, Doc 06 §2.)

## 14. Glossary

- **Clock:** which party (employee/client/authority) currently owns a stage (`active_clock`).
- **Block:** a paused project awaiting doc/payment/authority/client action.
- **SOI:** Statement of Intent (FSSAI product declaration archive).
- **Query / deficiency letter:** authority request with a 30-day response window.
- **Allow-and-flag:** attendance face model that records + flags rather than blocking.
- **Vault:** Supabase Vault storing encrypted FSSAI portal credentials.
- **Field staff:** `is_field_staff=true` — exempt from office geofence.
- **RLS:** Row-Level Security (the authoritative authorization boundary).

## 15. Source-of-Truth Rules

1. **Code is authoritative** — where docs/context conflict with source, source wins.
2. **Exact numbers** in these docs are command-verified against commit `9558f90`.
3. **"Not Verifiable from Source Code"** marks anything whose truth lives outside the repo (secrets, live DB/cron state, platform infra).
4. **Active vs legacy** is explicitly labeled throughout.

---

*Consolidated reference grounded in source at commit `9558f90`. No application code modified.*
