# Phase 2 — Bulk Migration Validation Report

> **Method:** postgres_fdw (Option B), server-side `INSERT … SELECT` from Blue → Green. **Blue (production) was READ-ONLY throughout — only SELECTs over the FDW. No writes, no deletes on Blue.**

## Result: ✅ PASS — every table matches 1:1, zero orphans

### Guarantees (all met)
| Guarantee | Status |
|---|---|
| PKs & FKs preserved | ✅ rows copied verbatim (UUID PKs + all FK cols); loaded parents-before-children |
| Idempotent & resumable | ✅ NOT-EXISTS anti-join on each PK; atomic DO block (fail → clean rollback, re-run safe) |
| Sequences/identity synced | ✅ post-load `setval` sweep ran; no serial/identity sequences exist (all UUID PKs) — nothing could drift |
| Validation after each table | ✅ per-table Green-vs-Blue counts below; all equal |
| Production read-only | ✅ FDW SELECT-only; Blue never written/deleted |

### Identity layer (loaded earlier, via SQL)
- **auth.users: 5** prod users, exact UUIDs + **bcrypt password hashes preserved** → existing passwords work (no reset).
- **auth.identities: 5**, **profiles: 5**, **user_roles: 5** (RBAC role_key set) — both `auth_role()` and `has_perm()` satisfied.
- Config ownership (hr_policy_settings, hr_statutory_config) repointed to tarun.

### Business data — all 40 tables, Green == Blue
soi_products 4103=4103 · notifications 1552=1552 · whatsapp_log 1372=1372 · stages 595=595 · stage_audit_log 495=495 · stage_timeline 476=476 · login_attempts 394=394 · notification_log 316=316 · audit_log 315=315 · credential_access_log 217=217 · payments 102=102 · projects 93=93 · query_points 89=89 · clients 78=78 · licenses 64=64 · attendance_punches 53=53 · stage_templates 38=38 · authority_queries 25=25 · soi_archive 22=22 · project_products 19=19 · project_remarks 18=18 · block_requests 16=16 · cancel_requests 8=8 · tasks 4=4 · app_settings 4=4 · referrals 3=3 · stage_documents 3=3 · code_counters 2=2 · office_locations/attendance_settings/reminder_settings 1=1 · (empty in prod, empty in Green: documents, client_documents, employee_details, knowledge_base, performance_reports, project_transfers, task_comments, task_extension_requests, delete_requests).
**Difference on every table: 0.**

### Vault
- **64/64 secrets** copied (1 `google_sa_json` + 63 `fssai_cred_<license-uuid>`). Names match preserved license UUIDs → credential-reveal will resolve. Copied server-side over FDW (plaintext never left the databases).

### Integrity
- FK orphan checks (licenses→clients, projects→clients, stages→projects, payments→projects, stage_timeline→stages, query_points→authority_queries, profiles→auth.users): **all 0**.
- Test data fully purged (0 `@staging.test` users; platform config preserved: roles 7, permissions 81, role_permissions 293).

## Notes
- Blue is **live**, so its counts keep growing (e.g., clients 77→78 during this work). Green matches Blue's snapshot at copy time. Any rows added on Blue after this point are reconciled by the **cutover delta-sync** (re-run of the same idempotent copy) during Phase 4.
- The `blue_src` FDW link is **retained** (for the delta-sync); it will be dropped after cutover.

## Storage — ✅ COMPLETE
Copied via `scripts/migrate-storage.mjs` (Storage API, service-role, prod read-only). Green == Blue on every bucket: **attendance 56, avatars 1, documents 8, face-refs 5** (70 objects). (Green also has 2 orphaned test invoice PDFs in `invoice-pdfs` that predate the migration; Supabase blocks direct SQL deletion and the finance module is empty, so they're inert — left as-is.)

## Phase 2 — COMPLETE ✅
Data (40 tables 1:1) · identity (5 users, passwords preserved) · RBAC · Vault (64) · Storage (70). Production untouched throughout.

## Remaining — Phase 4 cutover only
Brief freeze → final delta-sync (re-run the idempotent FDW copy to catch rows added on Blue since) → flip GitHub Pages secrets + merge staging→main → live on the new backend. Then drop the `blue_src` FDW link.
