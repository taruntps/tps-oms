# TPS OMS — Go-Live Runbook (Promote Staging → Live)

> **Strategy (approved):** blue-green cutover. Copy ALL production data + storage + secrets onto the staging project (`gytscakgtsbxgdkbqhbx`), soak ~1 day, then make it the live backend and point `portal.tpsxpert.com` (GitHub Pages) at it. **Old prod (`muxwwvwmephtwghsrzbp`) stays fully live until the flip, then paused (not deleted) for ~2 weeks as rollback.**
> **Frontend:** GitHub Pages (`deploy.yml` on `main`). Cloudflare = retired.
> **Cutover:** brief evening data-entry freeze + final delta sync → zero data loss.
> Nothing in this runbook is executed until each phase is approved.

## Environments
| | Old prod (Blue) | New live (Green) |
|---|---|---|
| Supabase | `muxwwvwmephtwghsrzbp` (`tps-oms`) | `gytscakgtsbxgdkbqhbx` (`tps-oms-staging`) |
| Created | 2026-06-22 | 2026-07-15 |
| Schema | Wave-1 (41 tables) | Full platform (156 tables) + PR1–PR5 hardening |
| Frontend | GitHub Pages `main` | GitHub Pages `main` (after merge) |
| Role after go-live | paused rollback | **live** |

---

## Phase 0 — Pre-flight (no downtime; old prod untouched)
- [ ] **0.1 Tier + PITR (BLOCKER).** Confirm Green is on a paid tier (free tier auto-pauses → fatal for prod). Enable Point-in-Time Recovery + daily backups. *If Green is free-tier, upgrade before proceeding.*
- [ ] **0.2 Backup Blue.** On-demand backup of old prod + record restore point. (Green work never writes Blue, but this protects the source.)
- [ ] **0.3 Freeze the codebase.** `staging` branch green: `npm run build` (tsc -b), `vitest`, ESLint 0 errors.
- [ ] **0.4 Inventory secrets to move** (Phase 2.C/2.D): Vault (Google SA JSON, FSSAI creds), Edge Function env (Resend, AiSensy, service-role), any app_settings tokens.

## Phase 1 — Prepare Green backend
- [ ] **1.1 Purge test data** (Green only, never Blue): clear the 41 business tables' staging test rows + test auth users, so only real prod data remains after the copy. Idempotent; keeps schema/policies/functions.
- [ ] **1.2 Apply the prod security hotfix on Green** (migration 101 RPC revokes already in repo; confirm applied) + disable public sign-ups + leaked-password protection. *(Green must be at least as locked-down as Blue before it holds real data.)*
- [ ] **1.3 Confirm Edge Functions present on Green** (verified: 14 incl. billing-worker). Skip Blue's junk (`awstest-temp`, `facediag-temp`).

## Phase 2 — Full data + assets copy (Blue = read-only source)
Order follows the FK dependency chain (see PROD_TO_STAGING_DATA_COPY_PLAN.md). Idempotent `INSERT … ON CONFLICT (id) DO NOTHING`; IDs/timestamps/ownership preserved; validate row counts per table; **stop on any mismatch**.

- [ ] **2.A Auth users.** Recreate ALL real prod users in Green auth with the **same UUIDs** (so every `created_by`/`assigned_to`/`manager_id` FK resolves). Passwords can't transfer → queue reset emails for Phase 4.
- [ ] **2.B Business data.** All 41 tables in dependency order: profiles → masters → clients → licenses → projects → project_products → stages → child tables (payments, tasks, documents, authority_queries, soi_archive, attendance, employee_details, …) → logs. Nothing skipped.
- [ ] **2.C Storage objects.** Copy all bucket contents (`documents`, `soi`, `attendance` selfies, `avatars`, invoice PDFs) so file links resolve. *(DB rows alone would 404.)*
- [ ] **2.D Vault + Edge secrets.** Re-enter Google SA JSON + FSSAI credentials in Green Vault; set Resend/AiSensy/service-role env on Green Edge Functions. Verify `drive-ops` + a WhatsApp/email send in Green.
- [ ] **2.E Validation report.** Per-table Blue-vs-Green counts, FK integrity, null-relationship checks, storage object counts. Any inconsistency → halt.

## Phase 3 — Soak (~1 day; both environments running)
- [ ] **3.1** You + staff test Green (via a temporary preview URL) against real data: login, dashboards, CRM, clients, projects, tasks, finance, attendance (+face), HRMS, reports, documents, Drive, permissions per role.
- [ ] **3.2** Log any issues; fix on `staging`; re-verify. Old prod keeps serving normal business throughout.

## Phase 4 — Cutover (evening; ~30-min freeze)
- [ ] **4.1 Announce freeze.** Ask staff to stop data entry on old portal for the window.
- [ ] **4.2 Final delta sync.** Copy rows created/changed on Blue since the Phase-2 snapshot → Green (upsert, incl. updates). Re-validate counts.
- [ ] **4.3 Flip frontend.** Set GitHub Actions secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) to Green; merge `staging → main`; confirm the `Deploy to GitHub Pages` run succeeds and `portal.tpsxpert.com` serves the new asset hash.
- [ ] **4.4 Send password-reset emails** to all staff.
- [ ] **4.5 Smoke test on the live domain** (Deployment Validation checklist 8): login, headers, anon RPC → 403, Drive, attendance face, one write per module.

## Phase 5 — Post go-live
- [ ] **5.1** Monitor Green logs 24–48 h (Postgres + Edge Functions).
- [ ] **5.2** Keep Blue **paused, not deleted**, ≥ 2 weeks as instant rollback.
- [ ] **5.3** Retire Cloudflare staging deployment.
- [ ] **5.4** Rollback path if needed: revert `main` merge (GitHub Pages redeploys Blue-backed build) + flip secrets back to Blue.

## Guarantees
Old prod is **read-only source** during copy and **live** until the flip; never truncated, never deleted (paused only). All copy steps idempotent/resumable/validated. The only irreversible-feeling step (domain flip) is reversible via a `main` revert + secrets swap within minutes.
