# Plan — Bind each project to its FSSAI license (Option A)

**Goal:** Every project records **which FSSAI license it is for**, so the credential panel always reveals the *correct* license's portal password — even when a client has multiple licenses. Projects with **no** FSSAI license are supported (link is optional).

**Status:** PLAN ONLY — no code until approved.

---

## Problem & root cause (grounded in code)
- `projects.license_id` (uuid, nullable, FK→licenses.id) **already exists** but is **never set or read** by the app.
- `ProjectDetailPage.tsx:74,117`: loads **all** the client's licenses and picks `licenses.find(l => l.credential_username)` — i.e. the **first license that has a credential**. For a multi-license client this can be the wrong one.
- `ProjectForm.tsx`: create form has client/service/amount/assignee/target/notes — **no license selector**, so `license_id` is always NULL.
- Example: SHREE SHANKER has 2 Central licenses — `10724026000573` (issued) and a pending one (no number yet, username = app ref `10260717108854681`). Project `TPS-P-2026-0091` has `license_id = NULL`.

## Domain rules to honour (from user)
1. A **new application** = a license record with **no license number yet**; **username = app ref no** until the license is generated; **we set the portal password**. (This is exactly how the pending license already exists.)
2. Each project **tracks its license** (`projects.license_id`).
3. **Some projects have no FSSAI license** → `license_id` stays NULL, credential panel hidden. Valid, not an error.
4. On **license generation**, the license gets its number (status → active); username switches from app-ref to license number; password unchanged.

---

## Tasks

### T1 — Reveal the *project's* license, not "first with credential"
**File:** `src/pages/projects/ProjectDetailPage.tsx`
- Replace `const fssaiLicense = licenses.find(l => l.credential_username)` with resolution by the project's own license:
  `const fssaiLicense = licenses.find(l => l.id === project.license_id)`
- Show the FSSAI Password panel **only when `project.license_id` is set and that license has a credential**. If `license_id` is NULL → hide the panel (handles "no FSSAI license" projects).
- Label already shows `({fssaiLicense.credential_username})` — keep; it will now correctly show the app-ref (pending) or license number (issued) of the *bound* license.

### T2 — Add a License selector to project creation/edit
**Files:** `src/pages/projects/ProjectForm.tsx` (+ maybe a small `LicenseSelect` piece)
- Add an **"FSSAI License"** field (below Client), populated from the selected client's licenses (`useLicenses(client_id)`), each option showing: number **or** "Pending — <app ref>", type, status.
- Options include:
  - the client's existing licenses (issued or pending),
  - **"➕ New FSSAI application"** → inline fields: **App Ref No / Login ID** + **Portal password** → on submit, create a `licenses` row (`status='pending_approval'`, `license_number=NULL`, `credential_username=<app ref>`) and store the password via `store_fssai_credential`, then link it,
  - **"None (non-FSSAI project)"** → `license_id` stays NULL.
- Save the chosen/created license id to `projects.license_id`.
- Allow changing it later (the project Edit path uses the same form/logic).
- Keep `projects.app_ref_no` in sync with the bound license's `credential_username` for pending licenses (display continuity).

### T3 — Backfill existing projects' `license_id` (data migration)
**File:** `supabase/migrations/<next>_backfill_project_license_id.sql` (idempotent, additive)
- For each project with `license_id IS NULL`:
  1. If the project has an `app_ref_no` matching a license of the same client (`credential_username = app_ref_no` OR `license_number = app_ref_no`) → set that license.
  2. else if the client has **exactly one** license → set that license.
  3. else leave NULL (ambiguous — needs manual pick).
- Emit a report (count set via app-ref, via single-license, left NULL). **Must run before/with T1 deploy** so existing projects keep showing their credential.

### T4 — License issuance updates (verify/patch)
**File:** `src/pages/clients/LicenseForm.tsx`
- Confirm that editing a pending license to add its **license number** sets `status='active'` and (per rule 4) updates `credential_username` to the license number. Add if missing. Password/vault link untouched.

### T5 — Guard `store_fssai_credential` for pending licenses
**File:** `src/hooks/useLicenses.ts` (+ verify RPC)
- Ensure a credential can be stored on a license that has **no license_number yet** (username = app ref). (Function already keys by `p_license_id`, so this should already work — verify.)

---

## Testing (against 2 sample projects; shared live DB — test carefully on a branch)
1. SHREE SHANKER: create a test project bound to license **A** (`10724026000573`) → reveal shows A's password. Bind another to the **pending** license → reveal shows the pending one's password. Confirm they differ and are correct.
2. Project with **"None"** selected → no FSSAI panel, no errors.
3. Backfill: verify `TPS-P-2026-0091` gets `license_id` = the pending license (matched by app ref), reveal still correct.
4. Multi-license client where old behaviour showed wrong password → now correct.

## Rollout note
Post go-live, `staging` branch and production share the **same (Green) DB**. So: build on a branch, run the backfill migration in a transaction with a dry-run count first, and test with throwaway sample projects (delete after). No prod-schema destructive changes — all additive (`license_id` already exists; we only populate it + UI).

---

# FINALIZED BUILD STEPS (confirmed 2026-07-28)

**Confirmed design:** project creation stays unchanged (no FSSAI at creation). All FSSAI credential work happens **after**, on the project detail page. New-application default license type = **Central Licence**. Include a **"Link existing license"** option. This supersedes the "license selector at creation" idea above.

### Step 1 — Reveal the project's own license
`src/pages/projects/ProjectDetailPage.tsx`
- Line ~117: `const fssaiLicense = licenses.find(l => l.id === project.license_id)` (was: first with credential).
- Render the FSSAI Credential block by state (Step 2). `<FssaiReveal licenseId={project.license_id}/>` only when set.

### Step 2 — FSSAI Credential block on the project detail
`src/pages/projects/ProjectDetailPage.tsx`
- **If `project.license_id` set:** show linked license — username (`credential_username`), license number or "Pending", **Reveal password**, **Edit password**, **Unlink**.
- **If not set:** show
  - **App Ref No / Login ID** (existing editable field) + **Password** input + **Save credential** → calls `createProjectFssaiCredential` (Step 3). Type defaults to **Central Licence** (no prompt).
  - **"Link existing license"** dropdown of the client's licenses (number/pending + type + status) → calls `linkProjectLicense`.
  - Leaving it blank = non-FSSAI project (no panel content).

### Step 3 — Hooks
`src/hooks/useLicenses.ts` (+ `useProjects.ts` for the project update)
- `createProjectFssaiCredential({ projectId, clientId, appRefNo, password })`:
  1. `insert into licenses { client_id, license_type:'Central Licence', status:'pending_approval', license_number:null, credential_username:appRefNo, created_by }` → id
  2. `rpc store_fssai_credential(id, appRefNo, password)`
  3. `update projects set license_id=id, app_ref_no=appRefNo where id=projectId`
- `linkProjectLicense({ projectId, licenseId })` → `update projects set license_id`
- `unlinkProjectLicense({ projectId })` → set `license_id=null` (keeps the license record).
- Edit-password reuses existing `store_fssai_credential`; reveal reuses existing.

### Step 4 — Backfill existing projects (migration)
`supabase/migrations/<next>_backfill_project_license_id.sql` — idempotent, additive, **dry-run count printed first**:
- app_ref_no matches a same-client license (`credential_username` or `license_number`) → set;
- else client has exactly one license → set;
- else leave NULL (ambiguous → manual list).

### Step 5 — License issuance (verify/patch)
`src/pages/clients/LicenseForm.tsx` — adding a license number sets `status='active'` and switches `credential_username` to the number; password/vault untouched.

## Decisions — RESOLVED
- **D1:** credential added **after** project creation, on the project detail (per real workflow). ✅
- **D2:** `projects.app_ref_no` stays the editable field, mirrored to `licenses.credential_username`. ✅
- **D3:** ambiguous multi-license backfill → leave NULL + produce a manual-assign list. ✅
- New-license default type = **Central Licence**. ✅  · **Link existing license** included. ✅
