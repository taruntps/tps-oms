# Staging Environment Runbook — GitHub Pages (second repo)

**Decision:** Staging is hosted on **GitHub Pages** in a **separate repository**
(`taruntps/tps-oms-staging`). Production (`taruntps/tps-oms` → `portal.tpsxpert.com`)
and its `main` branch and workflow are **never touched**.

## Architecture

| | Production | Staging |
|---|---|---|
| Repo | `taruntps/tps-oms` | `taruntps/tps-oms-staging` (new) |
| Deploys from | `main` | that repo's `main` (= mirror of prod repo's `staging`) |
| Host | GitHub Pages | GitHub Pages |
| Domain | portal.tpsxpert.com | staging.tpsxpert.com |
| Vite `base` | `/` | `/` (same, because custom subdomain) |
| Supabase | prod `muxwwvwmephtwghsrzbp` | **new staging project** |
| CNAME | `public/CNAME` = portal… | stamped to `staging.tpsxpert.com` at build (workflow) |

Why a second repo: GitHub Pages serves only **one live site per repo**, and the
production repo already uses its one site. A second repo is the only GitHub-native
way to get an independent staging URL, and it keeps prod's repo/branch/workflow
untouched.

Tradeoff accepted: **no automatic per-PR preview URLs** (a Cloudflare/Vercel-only
feature). Not required for this workflow.

---

## Part A — Manual actions (ONLY these require the account owner)

These are account/billing/DNS/auth gated — they cannot be automated from an
assistant session:

1. **Create the staging Supabase project** (billable; region `ap-south-1`).
   Note its project ref, URL, anon key, and service_role key.
2. **Create the empty GitHub repo** `taruntps/tps-oms-staging` (Private).
3. **Add DNS record** at the domain host:
   `CNAME  staging  ->  taruntps.github.io`
4. **Set Actions secrets** in the staging repo
   (Settings → Secrets and variables → Actions):
   - `VITE_SUPABASE_URL`      = staging project URL
   - `VITE_SUPABASE_ANON_KEY` = staging anon key
5. **Enable Pages** in the staging repo: Settings → Pages → Source = GitHub Actions,
   Custom domain = `staging.tpsxpert.com`, Enforce HTTPS.

## Part B — Code push (once repo exists)

6. Mirror the `staging` branch of the prod repo into the new repo's `main`.
7. Add `.github/workflows/deploy.yml` = this folder's `deploy-staging.yml`.
   (It stamps `dist/CNAME=staging.tpsxpert.com`, so the mirrored `public/CNAME`
   pointing at production cannot cause a domain collision.)

## Part C — Supabase setup (automatable once project + access are authorized)

Targeting **only** the staging ref (never `muxwwvwmephtwghsrzbp`):

8. Apply all migrations (schema, RLS, functions, triggers, cron).
9. Create Storage buckets — including the missing `documents` bucket.
10. Deploy all Edge Functions; set their staging secrets.
11. **Sandbox integrations** (must be OFF in staging):
    - WhatsApp: `app_settings.whatsapp_enabled = false`
    - Email (ZeptoMail): `reminder_settings.email_enabled = false`
    - Google Drive / Google Sheets: staging/no-op credentials only
12. Create **test users for every role** (super_admin, director, manager, employee, …).
13. Seed **only safe synthetic data**. NEVER copy production attendance, face/biometric
    images, or client/employee confidential documents.

## Part D — Validation

14. Verify: Login, Dashboard, Attendance, Projects, Clients, Payments, Reports,
    Notifications, Edge Functions, Storage, Auth, RLS/permissions.

---

## Session limitation (why Part A/B can't be done from here)

- The **GitHub** connector and **Supabase** management access require an
  interactive authorization/OAuth step that a non-interactive assistant session
  cannot perform.
- Creating a Supabase project is **billable** and account-level — it needs the
  owner's explicit go-ahead and cost confirmation.

So Part A + B are done by the owner (steps above). Part C + D are then run against
the staging project once access is authorized.
