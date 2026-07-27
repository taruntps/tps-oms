# Phase 2 — Resume Checkpoint (PAUSED before any write)

> Status: **read-only audit complete. ZERO writes to Blue or Green.** Nothing purged, nothing copied. Resume here.

## Key discoveries this session
1. **Passwords ARE portable** — `auth.users.encrypted_password` is a bcrypt hash (not project-key encrypted). Copying auth.users rows verbatim preserves logins → **no password-reset emails needed**, so SMTP becomes fully optional. (Blue: 5 users, 4 identities.)
2. **Two authz systems, both must be satisfied for the 5 prod users:**
   - `auth_role()` = `select role from profiles` → copying `profiles.role` makes the OLD `has_role()` work automatically. ✅ via profiles copy.
   - `has_perm()` reads `user_roles.role_key` + `role_permissions` → **must create `user_roles` rows** for each prod user, else they get no permissions (incl. tarun locked out of new modules).
   - role_key vocabulary: `super_admin, director, manager, executive, accounts, hr, auditor`.
   - Prod profiles.role distribution: super_admin ×1 (tarun), manager ×1 (jyoti), executive ×3 (regulatory, advisory, head.ra) → map 1:1 to role_key.
3. **Green is a full platform, not an empty vessel.** ~90 staging-only tables FK into profiles/clients/projects. Census of non-empty staging-only tables:
   - **KEEP (config/seed):** role_permissions 293, permissions 81, roles 7, notification_types 15, hr_policy_settings 25, hr_component_master 10, hr_statutory_config 10, hr_attendance_statuses 9, hr_leave_types 7, hr_day_types 6, hr_employment_types 5, sales_services 6, crm_pipeline_stages 6, sales_deal_stages 5, hr_onboarding_templates 1, hr_shifts 1, organizations 1.
   - **CLEAR (test rows entangled with test users):** user_roles 8, finance_invoices 1, finance_invoice_lines 1, hr_holidays 3, billing_sync_log 13, billing_sync_queue 1, billing_provider_links 1.
4. **Config-ownership entanglement:** kept-config tables (e.g. hr_policy_settings, hr_statutory_config) have `created_by`/`updated_by` → **test** profiles. Deleting test profiles requires repointing or nulling these first.
5. **Green test auth users (8) to remove** (UUIDs captured in transcript): superadmin/director/manager/accounts/hr/auditor/executive/field @staging.test.

## Refined safe Phase-2 sequence (revised from mechanical purge)
1. Copy Blue auth.users (5) + auth.identities (4) → Green, **same UUIDs + password hashes** (additive; coexists with test users temporarily).
2. Copy Blue profiles (5) → Green profiles (additive).
3. Create `user_roles` for the 5 prod users (map profiles.role → role_key).
4. Repoint kept-config ownership (created_by/updated_by) from test-profile UUIDs → tarun's UUID **[DECISION 1]**.
5. Delete test business rows from the 41 tables + entangled test rows (user_roles-for-test, finance_invoices/_lines, hr_holidays, billing_*) + 8 test profiles + 8 test auth users.
6. Copy Blue business data (41 tables) in FK order via JSON method, idempotent, per-table count validation.
7. Copy storage objects (~68, ~5.5 MB).
8. **[DECISION 3]** Migrate 64 Vault secrets (auto: decrypt-in-Blue → recreate-in-Green; plaintext transits tool output) OR manual.
9. Full Blue-vs-Green validation report. Stop before cutover (Phase 4).

## Decisions to confirm on resume
- **D1 — config ownership:** repoint kept-config `created_by/updated_by` to tarun (super_admin) [recommended] vs set NULL.
- **D2 — RBAC:** create user_roles for the 5 users by role mapping above [recommended yes].
- **D3 — Vault:** auto-migrate all 64 secrets [recommended] vs manual re-entry.
- Note: password-reset/SMTP now OPTIONAL (hashes copy). Confirm OK to carry hashes over.

## Prereqs status
✅ Green daily backups · ✅ Blue restore point (26 Jul 23:43 UTC) · ✅ sign-ups off + leaked-pw on + Site URL/redirects (assumed saved) · SMTP now optional · Item-4 secret values: user to gather (Vault auto-migratable).
