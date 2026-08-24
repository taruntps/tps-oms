# Per-Employee Access Overrides — Design Spec

**Date:** 2026-08-24
**Author:** Tarun (with Claude)
**Status:** Design approved in chat; awaiting spec review → implementation plan.

## Goal
Let an admin control, **per employee and independent of role**, which **Module → Head → Subhead (page)** they can access and whether **View** or **Edit** — layered on top of the role defaults. Enforced in the **nav, routes, edit-actions**, and (for sensitive modules) at the **data layer (RLS)**.

Primary use case: an "office assistant" on the Executive role who should see **only Attendance** (view), nothing else — even though other Executives see everything.

## Non-goals (v1)
- Field-level permissions (control is whole-page, not per field).
- Replacing/removing the role system — roles remain the **default**; overrides adjust per person.
- Per-record sharing / ownership changes.

## Confirmed decisions
1. **Granularity:** Module → Head → Subhead, each set to **Inherit (role) / Hidden / View / Edit** per employee.
2. **Enforcement depth:** Nav + Route + Buttons for **every** module; **plus** true data-level (RLS) lock for **sensitive modules** (Finance, HRMS salary/personal).
3. **Admin UI:** a **"Manage access"** panel inside **User Management** (per-employee).

---

## Current architecture (baseline)
- **Grant-based RBAC:** tables `roles / user_roles / permissions / role_permissions`; RPCs `my_permissions()` and `has_perm()`; hook `useCan(perm_key, scope)`. Scopes: own/team/all.
- **~81 permission keys** shaped `module.resource.action` (view / manage / approve / …) across admin, crm, documents, finance, hrms, knowledge, sales.
- **Nav = registry-driven:** each module contributes `NavEntry` items (a **Subhead**, with a `permission` view-key + optional `roles`). `navGroups.ts` groups them into **Heads** (`Dashboard, Business, Finance, HRMS, Documents, Reports, Administration, General`). `Sidebar` renders `getNavFor(role)` then filters by `my_permissions()` — a page shows only if the user **holds its permission**. Today permissions come **only from the role**, so all Executives are identical (the limitation).
- **Routes:** `ProtectedRoute` checks **`allowedRoles` only — no permission check** (the deep-link gap to close).

---

## Model

### 1. Per-user overrides on the permission set
New table:
```
user_permission_overrides(
  user_id   uuid  references profiles(id) on delete cascade,
  perm_key  text  references permissions(perm_key),
  effect    text  check (effect in ('allow','deny')),
  created_by uuid, created_at timestamptz default now(),
  primary key (user_id, perm_key)
)
```
- `my_permissions()` **v2** = role permissions, then **+ allow** overrides, **− deny** overrides, for that user. `super_admin` stays a hard floor (always full; not reducible).
- `has_perm(perm_key, scope)` **v2** applies the same merge, so **RLS honors overrides** too (not just the UI).
- RLS on this table: only `admin.users.manage` holders (super_admin/director) may read/write. **Users cannot self-grant** — writes go through an admin-gated RPC.

### 2. Head → Subhead → perm-key "access catalog"
Each Subhead already has a **view** key (`NavEntry.permission`). We add its **edit** key and a **sensitive** flag. Stored as a seeded DB table so the **admin matrix and the RLS-sensitive list share one source of truth**:
```
access_subheads(module, head, subhead_label, path, view_key, edit_key null, sensitive bool)
```
Level → override mapping per subhead:
| Level | Effect on keys |
|---|---|
| **Inherit** | no override rows (role decides) |
| **Hidden** | `deny view_key` (+ `deny edit_key`) |
| **View** | `allow view_key`, `deny edit_key` |
| **Edit** | `allow view_key` + `allow edit_key` |

---

## Admin UI — "Manage access" (User Management)
- **Entry:** a shield/key **"Manage access"** action on each user row → opens a **full-height right drawer** (scrollable).
- **Body:** grouped by **Head** (collapsible); each **Subhead** row = a segmented control **[Inherit · Hidden · View · Edit]**, showing the role's default as a hint and **highlighting overridden rows**. Sensitive subheads get a 🔒 badge (data-locked).
- **Quick actions:** **"Restrict to modules…"** (pick Heads → everything else Hidden — one-click office-assistant setup), **"Reset to role"** (clear all overrides), **"Copy access from…"** (another employee).
- **Save:** admin-gated RPC upserts/deletes override rows, then **invalidates the target user's `my_permissions` cache** (realtime or on next load). No effect on other users.

---

## Enforcement layers
1. **Nav** — already filters by `my_permissions()`; overrides flow through automatically. A **Head auto-hides** when all its Subheads are hidden.
2. **Routes** — extend `ProtectedRoute` with an optional **`permission` prop** (checks `useCan`; redirects to the user's first visible page / `/dashboard`; fail-closed while loading). Wire the correct key onto each route (mechanical pass across module route tables). Blocks deep-links.
3. **Edit buttons/actions** — pages already gate edits with `useCan(...manage)`; overrides flow through. Audit and add `useCan` on any edit action that isn't gated yet (focus: sensitive/edit-controlled pages).
4. **Data / RLS (sensitive set, this project)** — rewrite RLS on sensitive tables to consult `has_perm(view/manage)` so a per-user **deny truly blocks API reads/writes**. Initial sensitive set (finalize in planning):
   - **HRMS salary/personal:** `hr_employee_salary`, `hr_employee_salary_components`, `hr_salary_structures`, `hr_salary_components`, `hr_salary_revisions`, `hr_payslips`, `hr_payroll_*`, `hr_bank_advice*`, `hr_employee_bank`, `hr_employee_medical`, `hr_employee_family`, `hr_employee_statutory_ids`, `hr_employee_nominees`, `hr_loans`, `hr_loan_schedule`, `hr_reimbursements`, `hr_variable_pay`, `hr_arrears`, `hr_fnf_settlements`.
   - **Finance:** `invoices`, `invoice_lines`, `payments`, `govt_fees` (and related).
   - `super_admin` bypass preserved on all.

---

## Security
- **super_admin = hard floor** (full access; overrides never apply to them).
- Overrides are **admin-written only** (RLS + RPC gate); no self-escalation.
- Real enforcement is **server-side** (`my_permissions` + `has_perm` + RLS); UI hiding is convenience. `has_perm` MUST be updated in lockstep with `my_permissions` so RLS and UI agree.

## Data flow
Admin edits matrix → RPC writes `user_permission_overrides` → cache invalidation → target user's `my_permissions()`/`has_perm()` reflect it → **nav, routes, buttons, and sensitive-table RLS** all honor it.

## Edge cases
- Head with all subheads hidden → Head not rendered.
- Access changed while the user is logged in → applies on cache refresh / next login (optional realtime invalidation).
- Deep-link to a denied route → redirect to a **guaranteed-visible** landing (their first visible page; `/dashboard` must never be hideable, or fall back to a safe "no access" page).
- Office assistant: **Restrict to → Attendance = View** → everything else hidden, routes blocked, salary RLS denies.

## Rollout (additive, safe)
- Migration: add `user_permission_overrides` + `access_subheads` (seeded) + update `my_permissions()`/`has_perm()` to merge overrides. **No override rows yet ⇒ behavior identical to today.**
- Add the permission route-guard + wire keys.
- Tighten sensitive-module RLS to `has_perm`.
- Build the admin UI.
- **No employee's access changes until an override is set.** Then configure the office assistant and anyone else.

### Suggested phasing (both land before "done"; phased for safe testing)
- **Phase 1** — model + `my_permissions`/`has_perm` merge + admin "Manage access" UI + **nav/route/button** enforcement. (Delivers the feature for all modules.)
- **Phase 2** — **sensitive-module RLS** data-lock (Finance + HRMS salary/personal).

## Testing
- **Unit:** `my_permissions` merge (role + allow − deny); super_admin floor.
- **RLS/integration:** as a restricted user's JWT, salary/finance queries return empty/denied; as an allowed user, they succeed.
- **Manual:** office assistant sees only Attendance; deep-link to `/finance/invoices` redirects; edit buttons hidden when level = View.

## Open items to finalize during planning
1. Exact **sensitive table list** + the perm_key each maps to.
2. `access_subheads` as a **DB table** (recommended) vs a code map.
3. Redirect target for a denied deep-link (first visible page vs `/dashboard`).
