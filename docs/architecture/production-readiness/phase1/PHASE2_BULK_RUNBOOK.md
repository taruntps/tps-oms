# Phase 2 — Bulk Data Copy Runbook (resume point)

> **Done so far (verified, via SQL — additive, no purge yet):** 5 prod auth users (same UUIDs + bcrypt password hashes → existing passwords work), 5 auth.identities, 5 profiles, 5 user_roles (RBAC), config ownership repointed to tarun. Green currently holds prod's 5 users **alongside** the 8 test users (test data not yet purged).
>
> **Remaining:** purge test data · copy 41 business tables (~10,328 rows) · copy 64 Vault secrets · copy ~68 storage objects · validate.

The bulk table data must move DB→DB (too large to move reliably any other way). Two ways — pick one.

## Option A — pg_dump | psql (recommended; you run 1 command)
Get both DB passwords from Supabase → each project → **Settings → Database → Connection string / Password**. Then in your terminal:

```bash
BLUE="postgresql://postgres:BLUE_DB_PASSWORD@db.muxwwvwmephtwghsrzbp.supabase.co:5432/postgres"
GREEN="postgresql://postgres:GREEN_DB_PASSWORD@db.gytscakgtsbxgdkbqhbx.supabase.co:5432/postgres"

# 41 business tables, data-only, idempotent, FK-safe (replica mode disables FK/triggers during load)
( echo "SET session_replication_role = replica;"; \
  pg_dump "$BLUE" --data-only --column-inserts --on-conflict-do-nothing \
    -t public.referrals -t public.office_locations -t public.code_counters -t public.stage_templates \
    -t public.reminder_settings -t public.attendance_settings -t public.app_settings \
    -t public.clients -t public.licenses -t public.projects -t public.project_products \
    -t public.stages -t public.employee_details -t public.attendance_punches -t public.knowledge_base \
    -t public.notifications -t public.audit_log -t public.performance_reports -t public.credential_access_log \
    -t public.documents -t public.client_documents -t public.payments -t public.tasks \
    -t public.authority_queries -t public.block_requests -t public.cancel_requests -t public.project_remarks \
    -t public.project_transfers -t public.soi_archive -t public.stage_timeline -t public.stage_documents \
    -t public.stage_audit_log -t public.query_points -t public.soi_products -t public.task_comments \
    -t public.task_extension_requests -t public.login_attempts -t public.notification_log \
    -t public.whatsapp_log -t public.delete_requests \
) | psql "$GREEN"
```
Notes: `--on-conflict-do-nothing` = safe to re-run; `--column-inserts` handles the 7 tables where Green has extra columns; `profiles` is intentionally NOT in the list (already loaded). **This does not touch Blue** (read-only pg_dump).

## Option B — postgres_fdw (I run the copies; you paste one setup block)
Paste into **Green → SQL Editor** (keeps your password on your side):
```sql
create extension if not exists postgres_fdw;
create server if not exists blue_src foreign data wrapper postgres_fdw
  options (host 'db.muxwwvwmephtwghsrzbp.supabase.co', port '5432', dbname 'postgres');
create user mapping if not exists for postgres server blue_src
  options (user 'postgres', password 'BLUE_DB_PASSWORD');
create schema if not exists blue_src;
import foreign schema public from server blue_src into blue_src;
```
Then tell me it's done — I run all `INSERT INTO public.t SELECT ... FROM blue_src.t ON CONFLICT DO NOTHING` in FK order, plus Vault + validation, server-side.

## Then I finish (both options)
1. **Purge** the 8 test users + their entangled rows (user_roles-test, finance_invoices/_lines, hr_holidays, billing_* test logs) — script prepared, I run with your ok.
2. **Vault (64 secrets)** — via Option B I copy `blue_src` decrypted secrets → `vault.create_secret` on Green (names match preserved license UUIDs). Via Option A, run one extra pg_dump of `vault.secrets` OR I guide.
3. **Storage (~68 files)** — small script using both projects' service-role keys (I provide).
4. **Validation** — per-table Blue-vs-Green row counts + FK integrity report.

## Prod safety
Blue is only ever read (pg_dump / FDW SELECT). Never written, never deleted.
