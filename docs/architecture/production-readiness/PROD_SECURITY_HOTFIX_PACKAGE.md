# Production Security Hotfix Package (Pre-PR4)

> **Status: PREPARED FOR REVIEW. Nothing executed. Production untouched.**
> Scope: close the two anon-exposed `SECURITY DEFINER` RPCs on **production** (`portal.tpsxpert.com` Supabase project) + dashboard hardening. Mirrors staging migrations `100`/`101`.
> ⚠️ **Drift caveat:** this environment can only reach **staging** (`gytscakgtsbxgdkbqhbx`). Per `[[tps-oms-migrations-not-source-of-truth]]`, prod may differ. Therefore **Step A (verify on prod) is mandatory before the migration** — do not skip it.

---

## Part 1 — Production Verification

### Evidence from repo + migration history
- **Function definitions are NOT in any committed migration.** `get_google_sa_json()` and `get_employee_face_by_email(text)` are referenced **only** by the revoke migrations `100`/`101`; their `CREATE FUNCTION` was applied **out-of-band** (SQL editor/dashboard) historically. → Their grants on prod are **unknown until queried** — most likely the Postgres/Supabase default (`EXECUTE` to `PUBLIC`), i.e. the same vulnerability as staging had.
- **Only staging has the fix.** Migrations `100`+`101` (the revokes) were applied to the **staging** project only. No evidence they were ever applied to prod.
- **No production application feature depends on either function:**
  - Client (`src/`): **zero** references to either RPC (evidence: grep clean).
  - `get_google_sa_json()`: called **only** by the `drive-ops` Edge Function via `SUPABASE_SERVICE_ROLE_KEY` (`supabase/functions/drive-ops/index.ts:158`) → unaffected by revoking `anon`/`authenticated`.
  - `get_employee_face_by_email(text)`: **no caller anywhere** in the repo (client or edge) — orphaned from the removed face-login flow.

### Step A — MANDATORY: run this READ-ONLY query on PRODUCTION first
Confirms the functions exist, their exact signatures, SECURITY DEFINER status, and who can execute. **This does not modify anything.**
```sql
select p.oid::regprocedure as function_signature,
       p.prosecdef        as security_definer,
       pg_get_userbyid(p.proowner) as owner,
       has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_exec,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') as service_role_exec,
       array_to_string(p.proacl, ' | ')        as raw_acl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_google_sa_json','get_employee_face_by_email')
order by p.proname;
```
**Decision gate:**
- If `anon_exec=true` or `authenticated_exec=true` → **vulnerable, proceed** with the migration.
- If both already `false` → prod is already fixed; **no migration needed** (skip Part 2).
- If a **signature differs** from `get_google_sa_json()` / `get_employee_face_by_email(text)`, or a function is **absent** → the idempotent migration below handles it safely (only acts on functions that exist with these signatures); if a *different* signature exists, **STOP and send me the output** to adjust.

---

## Part 2 — Production Migration Package

**Purpose:** remove `EXECUTE` from `PUBLIC`/`anon`/`authenticated` on the two secret/biometric-returning definer functions; keep `service_role` (Edge Functions). Function **bodies are not modified**.

**SQL (idempotent — safe whether or not each function exists on prod):**
```sql
-- PROD hotfix: revoke anon/public EXECUTE on secret-exposing SECURITY DEFINER RPCs.
-- Wrapped in existence checks so it applies cleanly regardless of prod drift.
do $$
begin
  if to_regprocedure('public.get_google_sa_json()') is not null then
    revoke execute on function public.get_google_sa_json() from public, anon, authenticated;
    grant  execute on function public.get_google_sa_json() to service_role;
  end if;
  if to_regprocedure('public.get_employee_face_by_email(text)') is not null then
    revoke execute on function public.get_employee_face_by_email(text) from public, anon, authenticated;
    grant  execute on function public.get_employee_face_by_email(text) to service_role;
  end if;
end $$;
```

- **Expected execution time:** < 50 ms (catalog/ACL-only change; no data touched).
- **Expected locks:** a brief `AccessExclusive`-class lock on each **function object** (pg_proc row) for microseconds. **No table locks, no row locks, no data scan.** The only theoretical wait is if `drive-ops` is *mid-execution* of `get_google_sa_json()` at that instant (sub-second). No impact on any table/query.
- **Risk assessment:** **LOW.** Metadata-only, reversible, no body change, no schema change, no data change; client has no dependency; edge functions use `service_role` (retained). Idempotent + existence-guarded → cannot error on missing/renamed functions.
- **Validation queries:** see Part 3.

---

## Part 3 — Production Validation (run AFTER the migration)
```sql
select p.oid::regprocedure as function_signature,
       p.prosecdef        as security_definer,
       pg_get_userbyid(p.proowner) as owner,
       has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_exec,          -- expect FALSE
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_exec, -- expect FALSE
       has_function_privilege('service_role',  p.oid, 'EXECUTE') as service_role_exec,  -- expect TRUE
       array_to_string(p.proacl, ' | ')        as raw_acl        -- expect: postgres=X | service_role=X
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname in ('get_google_sa_json','get_employee_face_by_email')
order by p.proname;
```
**Pass criteria:** `anon_exec=false`, `authenticated_exec=false`, `service_role_exec=true`, `raw_acl` shows only `postgres` + `service_role` (no bare `=X` PUBLIC entry).

**Confirm edge functions still work (functional):**
- After migration, open the app → a page that lists/opens a Google Drive folder (Documents/Drive tab) → files load = `drive-ops` (service_role) still calls `get_google_sa_json()` fine.
- Optional direct check (as an authenticated user, via the app or REST with the anon key): calling `rpc/get_google_sa_json` should now return **`403 / permission denied for function`** — proving anon/authenticated are blocked.

---

## Part 4 — Supabase Dashboard Configuration Guide (do NOT change yet)
Production project → apply in this order (full detail in `PR3_M4_DASHBOARD_SECURITY_CHECKLIST.md`):

**Authentication**
1. **Disable public sign-ups** — Auth → Sign In/Providers → "Allow new users to sign up" **OFF** (internal ERP; admin-provisioned only). *Highest priority.*
2. **Leaked password protection** — Auth → Passwords → enable HaveIBeenPwned check.
3. **Password policy** — min length **≥ 10** + character-class requirements.
4. **Redirect URL review** — Auth → URL Configuration → Site URL = `https://portal.tpsxpert.com`; allow-list = prod (+ staging) origins only.
5. **Session lifetime review** — refresh-token rotation + reuse detection ON; sensible max session/inactivity (complements app's 15-min idle logout); access token ≈ 1h.
6. **MFA recommendation** — enable TOTP; enforce/encourage for super_admin + director (0 enrolled today).

**Storage** — confirm `documents`, `attendance`, `face-refs`, `invoice-pdfs` are **private** with policies; `avatars` public is acceptable (optional: private + signed URLs).

**API** — confirm `service_role` key exists only in Edge Function secrets/server env (never client — code-verified clean); anon key is public by design; enable Network Restrictions on the DB if feasible.

---

## Part 5 — Rollback Plan
**SQL rollback (restores original PUBLIC grant):**
```sql
do $$
begin
  if to_regprocedure('public.get_google_sa_json()') is not null then
    grant execute on function public.get_google_sa_json() to public;
  end if;
  if to_regprocedure('public.get_employee_face_by_email(text)') is not null then
    grant execute on function public.get_employee_face_by_email(text) to public;
  end if;
end $$;
```
**Dashboard rollback:** re-enable any toggle you changed (e.g., re-allow sign-ups) — but note that reverting these *reintroduces* the risk; only roll back if a change caused a functional break.
**Validation after rollback:** re-run the Part 3 query; `anon_exec`/`authenticated_exec` back to `true` confirms rollback.
**When to roll back:** only if the Drive/Documents integration breaks post-migration (it should not, since it uses service_role). If it breaks, first check the `drive-ops` function still holds `service_role=X` (Part 3) before rolling back.

---

## Part 6 — Production Deployment Runbook (sequence)
1. **Backup database** — Supabase → Database → Backups: take an on-demand backup / confirm PITR is on. Record the restore point.
2. **Backup storage** — snapshot/export the buckets if a storage backup mechanism exists (buckets are unaffected by this migration, but capture a restore point per policy).
3. **Verify Edge Functions** — confirm `drive-ops` (and `face-login`, if present) are deployed and have `SUPABASE_SERVICE_ROLE_KEY` set in their secrets.
4. **Step A verification** (Part 1) — run the read-only query on prod; confirm vulnerable → proceed (or skip if already fixed).
5. **Execute migration** (Part 2) — run the idempotent `DO` block in the prod SQL editor (or via CI migration).
6. **Validate SQL** (Part 3) — confirm anon/auth = false, service_role = true.
7. **Update dashboard settings** (Part 4) — apply Auth hardening, starting with disabling sign-ups.
8. **Smoke test** (Part 7).
9. **Monitor logs** — Supabase → Logs (Postgres + Edge Functions) for ~30 min; watch for `permission denied for function` from legitimate callers (there should be none).

---

## Part 7 — Post-Deployment Smoke Tests (production)
Run logged-in as super_admin (and spot-check a non-admin role):

| Area | Check | Pass |
|---|---|---|
| Authentication | Password login works; no camera prompt on login; 13-min idle warning eventually appears | ☐ |
| Dashboard | Loads; role KPIs render; no console errors | ☐ |
| CRM | Leads pipeline + client list load | ☐ |
| Finance | Invoices/Payments/Finance load; figures correct | ☐ |
| HRMS | Employees, Leave, Payroll runs, Recruitment, Performance load | ☐ |
| Attendance | Punch page opens; **camera initialises for face capture** (Re-register face / punch works) | ☐ |
| Payroll | Payroll run detail + payslips accessible to hr/director only | ☐ |
| Reports | Reports load with data | ☐ |
| Documents / **Google Drive** | Open a project's Drive/Documents → **files list & open** (proves `drive-ops` → `get_google_sa_json` via service_role still works) | ☐ |
| Face Recognition | Attendance face capture works; **login has no face option** | ☐ |
| Edge Functions | Drive ops succeed; check Edge logs for errors | ☐ |
| Security spot-check | Anon `rpc/get_google_sa_json` returns 403 (blocked) | ☐ |

---

## Risk Assessment (overall)
- **Migration:** LOW — metadata-only, idempotent, reversible, no data/schema/body change, no client dependency, edge functions retain access.
- **Dashboard (disable sign-ups):** LOW — internal ERP; no legitimate self-signup. Verify no automated onboarding depends on open signup (none known).
- **Biggest residual:** operational (running the wrong project, or skipping Step A). Mitigated by the verify-first gate + idempotent SQL.
- **Blast radius if something's off:** confined to the two functions; rollback is one `GRANT`.

## Final Go / No-Go Recommendation
**GO — with the verify-first gate.** The change is a low-risk, reversible, metadata-only hardening that closes a live critical secret exposure; evidence shows no client/app dependency and edge functions are unaffected. Proceed provided:
1. **Step A** verification is run on prod first (confirm vulnerable + signatures match), and
2. A DB backup/restore point is captured (runbook step 1).

If Step A shows a **different function signature** or an unexpected dependency, **No-Go until reviewed** — send me the Step A output and I'll adjust.

**I have executed nothing and made no production changes. Awaiting your approval to (a) run Step A, or (b) proceed with the full runbook.**
