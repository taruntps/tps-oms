# PR5 Phase 2 — Production Checklists (prepare-only)

> Actionable runbooks for TPS OMS go-live. **Nothing here is executed** — these are for your review/use.
> **Architecture:** Frontend — production `portal.tpsxpert.com` = **GitHub Pages**, deployed by `.github/workflows/deploy.yml` on push to **`main`** (staging = Cloudflare Pages on `staging`). Backend — **Supabase** (prod project separate from staging `gytscakgtsbxgdkbqhbx`). Edge Functions — `drive-ops`, `face-login` (service-role).

---

## 1. Production Deployment Checklist
**Pre-deploy**
- [ ] All PRs (PR1–PR5) accepted; `staging` green (`npm run build`, `vitest 34/34`, ESLint 0 errors).
- [ ] UAT sign-off complete (Checklist 7).
- [ ] Prod **security hotfix** ready to apply (`PROD_SECURITY_HOTFIX_PACKAGE.md`).
- [ ] Prod env vars set in GitHub Actions secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (prod project values); `VITE_APP_URL=https://portal.tpsxpert.com`.
- [ ] Backup taken (Checklist 3) and restore point recorded.
- [ ] Maintenance window agreed; users notified.

**Backend (Supabase prod) — do BEFORE frontend**
- [ ] Run **Step A** verification (hotfix pkg) on prod → confirm current state.
- [ ] Apply pending migrations to prod (verify drift first — prod history may differ from repo). Capture prod schema snapshot first.
- [ ] Apply security hotfix migration `101` (RPC revokes).
- [ ] Apply dashboard settings (Checklist 5 / hotfix Part 4).
- [ ] Verify Edge Functions deployed + secrets set (`SUPABASE_SERVICE_ROLE_KEY`, Google SA in Vault).

**Frontend (GitHub Pages)**
- [ ] Merge `staging` → `main` (fast-forward; `staging` is ahead).
- [ ] Confirm GitHub Actions `Deploy to GitHub Pages` run succeeds (typecheck → test → build → deploy).
- [ ] Confirm `portal.tpsxpert.com` serves the new build (check asset hash changed).

**Post-deploy** → Checklist 8 (Deployment Validation).

---

## 2. Rollback Plan
**Frontend**
- [ ] `git revert` the merge commit on `main` (or reset to last-known-good tag) → push → Actions redeploys previous build. (GitHub Pages keeps prior deploys; ~2–3 min.)
- [ ] Verify `portal.tpsxpert.com` back to previous asset hash.

**Backend**
- [ ] Security hotfix rollback: `grant execute … to public;` (hotfix pkg Part 5) — restores prior grants.
- [ ] Migration rollback: apply the corresponding down-SQL, OR restore from the pre-deploy backup/PITR point (Checklist 4) if a migration is not cleanly reversible. **Prefer additive/expand-only migrations so rollback is rarely needed.**
- [ ] Dashboard rollback: re-enable any toggle changed (note: reverting security toggles reintroduces risk — only if it caused a break).

**Decision rule:** frontend rollback is always safe/fast; backend rollback via restore is last-resort (data-loss window = since backup) — prefer forward-fix for data-affecting issues.

---

## 3. Database Backup Strategy
- [ ] Confirm **Point-in-Time Recovery (PITR)** enabled on prod (Supabase → Database → Backups). If not, enable (paid tier) or schedule daily logical backups.
- [ ] Take an **on-demand backup immediately before** any prod migration/deploy; record the timestamp/restore point.
- [ ] Cadence: daily automated + retain ≥ 7 days (align to plan).
- [ ] Off-Supabase copy: periodic `pg_dump` export stored securely (e.g., encrypted, off-platform) for disaster recovery.
- [ ] Vault secrets (Google SA JSON, FSSAI creds) — documented recovery path (they are NOT in logical backups' decrypted form).
- [ ] Storage buckets: confirm backup/retention policy for `documents`/`attendance`/`face-refs`/`invoice-pdfs` (Supabase Storage is not covered by DB PITR).

---

## 4. Restore Strategy
- [ ] Identify restore point (PITR timestamp or on-demand backup).
- [ ] **Dry-run restore into a scratch/branch project** first — never test restore on prod.
- [ ] Restore steps (Supabase → Backups → Restore) documented with expected downtime.
- [ ] Post-restore validation: run the DB census query (PR5 P1), confirm RLS/policies/functions counts match expected; spot-check key tables (clients, projects, employees, invoices).
- [ ] Re-verify Edge Function secrets + Vault after restore.
- [ ] RTO/RPO agreed (e.g., RTO ≤ 1h, RPO ≤ 24h with daily backups / near-zero with PITR).

---

## 5. Go-Live Checklist (master sequence)
1. [ ] Freeze `staging`; final green gate.
2. [ ] Backup prod DB (Checklist 3); record restore point.
3. [ ] Backend: Step-A verify → apply migrations → apply security hotfix `101` → dashboard hardening (disable sign-ups, leaked-password, MFA, redirect URLs).
4. [ ] **Data Validation** (separate workstream): master-data reconciliation (GSTIN→PAN→Email→Mobile→Name) + one-time GetSwipe historical invoice import; verify counts.
5. [ ] Resolve **RoleBasedRedirect** landing decision (PR4 debt) if in scope for launch.
6. [ ] Frontend: merge `staging`→`main`; confirm Actions deploy to GitHub Pages.
7. [ ] Deployment Validation (Checklist 8).
8. [ ] Smoke test (PR3 hotfix Part 7 per-module list).
9. [ ] Monitor logs 30–60 min (Checklist 6).
10. [ ] Announce go-live to users; hand off to Support (Checklist 6).

---

## 6. Support Checklist (post-go-live)
- [ ] Monitor Supabase **Logs** (Postgres + Edge Functions) and **Reports** (API errors, slow queries) for 24–48 h.
- [ ] Watch for `permission denied for function` (should be none from legitimate callers post-hotfix).
- [ ] Auth: watch failed-login lockouts, session/refresh errors.
- [ ] Frontend errors: ErrorBoundary "Something went wrong" reports; chunk-load auto-reload (PR4) working.
- [ ] Escalation path defined: who fixes DB vs frontend vs Supabase infra; rollback authority.
- [ ] Known-issues register + user-facing FAQ (login, password reset via admin, idle-timeout).
- [ ] Daily backup verification for the first week.

---

## 7. User Acceptance Checklist (sign-off)
Per role, on the target environment:
- [ ] **Auth:** password login; no camera on login; 15-min idle → warning at 13 → logout.
- [ ] **Dashboard:** role-adaptive KPIs load; no console errors.
- [ ] **Business:** CRM pipeline, Clients, Referrals, Projects, Tasks.
- [ ] **Finance:** Sales, Billing, Finance, Collections — figures correct.
- [ ] **HRMS M1–M10:** Employees, Attendance (+face capture works), Leave, Payroll (hr/director only), Recruitment, Performance, Training, Assets, ESS, HR Dashboard.
- [ ] **Reports / Documents / Knowledge / Administration.**
- [ ] **Google Drive** integration (Documents/Drive tab) loads + opens files.
- [ ] **Permissions:** each role sees only its allowed surfaces; salary/PII confined to hr/director/super_admin.
- [ ] **Responsive:** desktop + tablet + mobile drawer.
- [ ] Sign-off recorded (name, date, environment).

*(Baseline already exercised in the authenticated UAT — see prior UAT report; this is the formal go-live sign-off.)*

---

## 8. Deployment Validation Checklist (immediately post-deploy)
- [ ] `portal.tpsxpert.com` loads; new asset hash confirmed (not cached old build).
- [ ] Login works (password); dashboard renders; **zero console errors**.
- [ ] Security headers present (CSP, HSTS, X-Frame-Options, Permissions-Policy) — `curl -I`.
- [ ] Anon `rpc/get_google_sa_json` → **403** (hotfix confirmed live on prod).
- [ ] Deep-link/refresh restores route (no bounce); sidebar renders complete (no flash) with groups collapsed-except-Dashboard.
- [ ] Drive integration works (`drive-ops` service-role RPC succeeds).
- [ ] Attendance face capture initialises; login has no face option.
- [ ] Spot-check one write per critical module (create/edit) succeeds + audit-logged.
- [ ] Edge Function logs clean.
- [ ] Rollback trigger criteria defined (what failure → roll back).

---

**Status:** all 8 checklists prepared. Nothing executed. Next: Phase 3 — Final Audit (scores + Go/No-Go).
