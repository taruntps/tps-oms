# Prod → Staging Data Copy — Plan (Phases 1–3) — for approval

> Goal: load a working copy of **production business data** into **staging** (`gytscakgtsbxgdkbqhbx`) to test v1.0 with real data. **Production (`muxwwvwmephtwghsrzbp`) stays read-only/untouched.** Nothing migrated yet — awaiting approval.

## Phase 1 — Database Comparison
- **Prod:** 41 base tables (Wave-1 era), 100% RLS, real data (67 clients, 90 projects, 61 licenses, 71 payments, 5 users, ~3.5k soi_products).
- **Staging:** 156 tables = the **same 41** + **~115 staging-only** (Wave-2 `crm_*`/`sales_*`/`finance_*`/`billing_*`, all HRMS `hr_*`, platform `roles`/`permissions`/`user_roles`/`organizations`/`folders`/`kb_*`/`document_templates`, etc.).
- **Prod-only tables: 0.** Every prod table exists in staging.
- **Column diff (critical):** staging is a **strict superset** of every common table → **no data-loss risk**. Only **7** tables gained columns:
  | Table | Staging-added columns |
  |---|---|
  | clients | industry, lifecycle_stage, owner_id |
  | documents | folder_id |
  | employee_details | blood_group, confirmation_date, employee_status, gender, marital_status, nationality, photo_url, probation_end_date, signature_url |
  | knowledge_base | category_id, client_visible, published_at, reviewed_by |
  | payments | invoice_id |
  | profiles | branch_location_id, department_id, designation_id, employment_type_id, grade_id, reports_to |
  | referrals | commission_percent, referral_code |
- Prod also has 2 **views** (`attendance_days`, `v_stage_timeline`) — skip (not data).

## Phase 2 — Migration Mapping
| Group | Count | Type | Why |
|---|---|---|---|
| Identical-schema tables (app_settings, attendance_*, audit_log, authority_queries, block/cancel_requests, client_documents, code_counters, credential_access_log, delete_requests, licenses, login_attempts, notification_log, notifications, office_locations, performance_reports, project_products, project_remarks, project_transfers, **projects**, query_points, reminder_settings, soi_archive, soi_products, stage_* , stages, task_*, tasks, whatsapp_log) | **34** | **Direct Copy** | columns identical → straight insert, preserve ids/timestamps |
| clients, documents, employee_details, knowledge_base, payments, referrals | **6** | **Copy with Transformation** | staging has extra columns → map prod columns, leave new ones NULL/default |
| **profiles** | **1** | **Merge + auth-special** | `profiles.id` = `auth.users.id`; staging already has 8 test users; must reconcile with auth (see decisions) |
| Wave-2 / HRMS / platform tables + prod views | **~115** | **Skip** | new capabilities — no prod source; stay empty/seeded |

## Phase 3 — Dependency Order (from the FK graph)
`auth.users` and several tables FK to it, so **auth first**, then:
```
0. auth.users (5 prod users)         ← auth-special
1. profiles                          ← FK auth.users
2. referrals, office_locations, code_counters, stage_templates,
   reminder_settings, attendance_settings   ← independent masters
3. clients                           ← FK profiles, referrals
4. licenses                          ← FK clients, profiles
5. projects                          ← FK clients, licenses, profiles, auth.users
6. project_products                  ← FK projects
7. stages                            ← FK projects, profiles, project_products
8. employee_details, attendance_punches, knowledge_base, app_settings,
   notifications, audit_log, performance_reports, credential_access_log
9. documents, client_documents, payments, tasks, authority_queries,
   block_requests, cancel_requests, project_remarks, project_transfers, soi_archive
10. stage_timeline, stage_documents, stage_audit_log, query_points,
    soi_products, task_comments, task_extension_requests
11. logs: login_attempts, notification_log, whatsapp_log, delete_requests
```
Every FK is satisfied by loading parents before children.

## 🔑 Decisions needed BEFORE any migration (these shape the scripts)
1. **Auth / users (the linchpin).** Every business row references `profiles.id` = `auth.users.id`. To copy prod data with intact ownership, the **5 prod users must exist in staging auth with the SAME ids**. Recommended: recreate them in staging auth (same ids) + set temporary passwords you control (real passwords are hashed per-project and won't carry over). Then all `created_by`/`assigned_to`/`manager_id`/`uploaded_by` FKs resolve automatically. → **Approve this approach?**
2. **Staging test data collision.** Staging currently holds test rows (8 test users, 3 test clients, 2 test projects, etc.). For a clean prod copy, recommended: **clear the 41 tables' staging test rows first** (staging only — never prod), then load prod. → **Clear-then-load (clean), or coexist (mixed)?**
3. **Storage files.** This copies DB **rows**; the actual files in prod Storage buckets (`documents`, `soi`, `attendance` selfies, `avatars`) are separate. Copied rows will reference `storage_path`s whose files aren't in staging → file links/downloads will 404 in testing. → **Copy storage objects too (extra step), or accept broken file links for now?**
4. **Vault secrets.** `licenses.vault_credential_id` points to FSSAI creds in **prod Vault** — these don't copy (Vault is per-project). Credential-reveal will be empty in staging. Acceptable for testing? (recommended: yes.)

## Phase 4–7 approach (preview — on approval)
- **Mechanism:** read prod (SELECT, batched) → insert into staging with `INSERT … ON CONFLICT (id) DO NOTHING` (idempotent, resumable, skips duplicates, preserves ids/timestamps). *Never* `TRUNCATE`/`DELETE` on prod; staging clears only per Decision 2 with your confirmation. (For big tables like `soi_products` ~3.5k, batched inserts or a one-time `postgres_fdw` pull.)
- **Validation (Phase 5):** after each table, compare prod vs staging row counts; check for missing rows, broken FKs, null relationships → report every mismatch; **stop on any inconsistency**.
- **App verification (Phase 6):** log in (real admin) → exercise Dashboard/CRM/Clients/Projects/Tasks/Finance/Attendance/Reports/Documents/Notifications/Admin against the copied data.
- **Final report (Phase 7):** tables/rows migrated, skipped, transforms, warnings, errors, integrity, success %.

## Guarantees
Prod = **read-only** throughout (only `SELECT`). No prod writes, no truncate, no destructive SQL. Idempotent + resumable. Staging changes are the only writes, and staging-clear happens only with your explicit confirmation.

**Awaiting your answers to the 4 decisions + approval to begin Phase 4 (starting with the auth/users + `profiles` step).**
