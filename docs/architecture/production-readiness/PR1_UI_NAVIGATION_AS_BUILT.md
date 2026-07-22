# PR1 — UI / Navigation Modernization — As-Built

> **Status:** ✅ Implemented on staging, awaiting **PR1 acceptance**. Freeze + tag `v1.0-pr1-ui-nav`. Improve-only; no business logic, schema, or routes changed.

## 1. Implementation Summary
Replaced the hard-coded flat sidebar (which ignored the module registry and duplicated HRMS/Attendance/Employees) with a **registry-driven, grouped, collapsible** enterprise sidebar. Navigation is now composed from `getNavFor(role)` + cross-cutting `coreNav`, organised into configurable groups (Dashboard · Business · Finance · HRMS · Documents · Reports · Administration). HRMS is now a single collapsible parent surfacing the full M1–M10 surface that was previously unreachable. Duplicate legacy entries are de-listed; the homepage is the existing role-adaptive `/dashboard` with admin (Director) KPIs merged in.

## 2. Files Changed
- `src/core/moduleTypes.ts` — `NavEntry` extended with optional `group?`, `order?` (additive).
- `src/core/navGroups.ts` *(new)* — group order, path→group config, `groupNav()` / `groupFor()`.
- `src/core/coreNav.ts` *(new)* — cross-cutting entries (Dashboard, Clients, Tasks, Reports) → existing routes.
- `src/core/registry.ts` — `getNavFor()` now prepends `coreNav`; legacy duplicates documented as intentionally excluded.
- `src/components/layout/Sidebar.tsx` — **rewritten**: grouped, collapsible, permission-filtered, registry-driven; Notifications moved to footer icon with unread badge.
- `src/modules/finance/nav.ts` — Invoices→**Billing**, Payments→**Collections**; `group`/`order`.
- `src/modules/crm/nav.ts`, `src/modules/operations/nav.ts`, `src/modules/sales/nav.ts` — labels + `group`/`order` for the Business/Finance sequence.
- `src/core/navGroups.test.ts` *(new)* — grouping + registry parity tests.
- `docs/architecture/production-readiness/PR1_UI_NAVIGATION_{DESIGN,AS_BUILT}.md`, `NAVIGATION.md`.

## 3. Database Changes
**None.** No migrations, tables, RLS, functions, or seed data touched.

## 4. Routes Changed
**None.** Every route remains mounted (including legacy `/attendance`, `/employees`, `/referrals`, `/director`). Only the **sidebar listing** changed — legacy duplicates are hidden; their routes stay reachable (removal is deferred to PR4 per Expand→…→Remove).

## 5. Permissions Changed
**None defined.** The sidebar now **honours** existing `permission` gates on nav entries (previously role-only) — verified all 15 non-HRMS keys + HRMS keys exist in `permissions`; `my_permissions()` floors super_admin, so admins see everything.

## 6. Performance Impact
Negligible/positive. Nav is computed with `useMemo` over the already-cached `my_permissions()` query (no new network calls). One collapsed HRMS group reduces initial DOM. Bundle unchanged materially.

## 7. Security Impact
**Slightly stronger.** Sidebar entries with a `permission` are now hidden unless the user holds the grant (fail-closed while permissions load), matching `useCan`. No gate was relaxed; RLS/route guards unchanged.

## 8. Testing Results
- `vitest` ✅ **34/34** (incl. new `navGroups` suite: path→group, group ordering, registry parity — legacy `/attendance`,`/employees`,`/referrals`,`/director` absent; Finance order Sales→Billing→Finance→Collections; all `/hrms/*` in one HRMS group ≥ 9 items).
- `vite build` ✅ clean. `tsc` agent-verified.
- **Browser UAT:** gated by Supabase login (credentials are the user's to enter) — visual/responsive UAT is on the acceptance checklist below.

## 9. Known Issues / Deferred
- **HRMS group** shows all permission-gated leaves under one parent (non-destructive); curating to the primary 9 + tucking sub-pages into in-page tabs is a follow-up (PR4/UX).
- **Operations** retained in the Business group (not in the required list) to avoid stranding the page — confirm keep/move at PR1 review.
- **Analytics** omitted (no page; Constitution: no new modules). **Collections**→`/finance/payments`, **Permissions**→within `/admin/roles` per locked decisions.
- **Reports** nav gated by roles only; `report_permissions`-based access for other roles still works via the route (not surfaced in nav).
- Detailed Director **pipeline/clock** charts remain at `/director` (route retained, de-listed); dashboard already carries the exec KPI row.

## 10. As-Built Document
This file. Design: `PR1_UI_NAVIGATION_DESIGN.md`. Navigation reference: `docs/architecture/NAVIGATION.md`.

## 11–12. Git Commit / Tag
Commit on `staging`; tag `v1.0-pr1-ui-nav`.

## PR1 Acceptance Checklist (user UAT on staging)
- [ ] Sidebar shows grouped sections: Dashboard · Business · Finance · HRMS · Documents · Reports · Administration.
- [ ] HRMS expands to the full M1–M10 surface (Employees…ESS, HR Dashboard).
- [ ] No duplicate menus (single Attendance/Employees/Referrals; one Dashboard).
- [ ] Finance order: Sales, Billing, Finance, Collections. Business: CRM, Clients, Referrals, Projects, Tasks.
- [ ] Collapsible groups; consistent icons/spacing; responsive on tablet + mobile drawer.
- [ ] Role check: executive/hr/accounts see only their permitted groups; Notifications badge works.
- [ ] `/dashboard` is the role-adaptive home; admins see the Director KPI row.
