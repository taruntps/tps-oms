# PR1 — UI / Navigation Modernization — Design (for acceptance)

> **Phase:** Design (of Design → Implement → Unit → Integration → Docs → Review → Freeze → Tag → **Stop**).
> **Constitution:** reuse-before-create, extend-before-replace, Expand→Migrate→Validate→Switch→Remove, no new modules, staging only. **Improve only.**
> **Status:** ⛔ Awaiting user acceptance of this design + the open decisions below. No code until accepted.

## 1. Current-state audit

- **Two competing navigation systems.** `src/components/layout/Sidebar.tsx` renders a **hard-coded flat `NAV` array (21 items)** and does **not** consume the module registry (`core/registry.ts` `getNavFor()`). The registry-driven nav — including the entire HRMS M1–M10 sub-navigation — is therefore **registered but never rendered**. Users reach HRMS via one `/hrms/employees` link and cannot navigate to Payroll/Leave/Assets/ESS/Dashboard from the sidebar.
- **Duplicate/legacy surfaces:** `/attendance` (legacy) vs `/hrms/attendance`; `/employees` (legacy) vs `/hrms/employees`; `/referrals` (legacy) vs `/crm/referrals`; two dashboards `/dashboard` ("My Dashboard") + `/director` ("Director View").
- **Flat structure, no grouping, no collapse.** Fixed `w-60` `<aside>`, no mobile/tablet handling, no responsive toggle.
- **Routes** are mounted in `App.tsx` as a mix of legacy hard-coded `<Route>`s **and** `getAllRoutes()` from the registry.

## 2. Target information architecture (required nav → existing route)

Grouped, collapsible parent menus. Every leaf maps to an **existing** route (reuse-before-create):

| Group | Item | Route (existing) | Notes |
|---|---|---|---|
| **Dashboard** | Dashboard | `/dashboard` | Becomes **role-adaptive**; Director View merged in |
| | Executive Dashboard | *(merged)* | `/director` content folds into role widgets on `/dashboard` |
| **Business** | CRM | `/crm/leads` | |
| | Clients | `/clients` | |
| | Referrals | `/crm/referrals` | legacy `/referrals` retired from nav |
| | Projects | `/projects` | |
| | Tasks | `/tasks` | (PR4 fixes Tasks defects) |
| **Finance** | Sales | `/sales/deals` | |
| | Billing | `/finance/invoices` | |
| | Finance | `/finance` | |
| | Collections | **gap** → `/finance/payments`? | see Decision 1 |
| **HRMS** | Employees…ESS | `/hrms/*` | **registry-driven**, one parent menu (M1–M10) |
| **Documents** | Documents | `/documents` | |
| | Knowledge Base | `/knowledge` | |
| **Reports** | Reports | `/reports/performance` | |
| | Analytics | **gap** — no page | see Decision 1 |
| **Administration** | Settings | `/settings` | |
| | Users | `/admin/users` | |
| | Roles | `/admin/roles` | |
| | Permissions | **gap** — merged into `/admin/roles` | see Decision 1 |
| | Audit Logs | `/admin/audit` | |

## 3. Architecture change (Constitution-compliant)

**Extend, not replace, the nav contract:**
1. **Expand** `NavEntry` (`core/moduleTypes.ts`) with optional `group?: string` and `order?: number` (additive; existing entries unaffected).
2. Tag each module's `nav.ts` entries with their `group` (HRMS entries collapse under one "HRMS" parent). No business logic touched.
3. **New registry-driven `Sidebar`** that renders **collapsible groups** from `getNavFor(role)` — role-adaptive, responsive (drawer on mobile/tablet, persistent on desktop), consistent icons/spacing, active-state, notification badges preserved.
4. **Migrate → Validate → Switch:** build the new Sidebar behind the same slot, verify parity against the current nav, switch `AppShell` to it.
5. **Remove** the hard-coded `NAV` array and de-list duplicate legacy entries. **Legacy routes stay mounted** (back-compat) this PR; their removal is a later contract step, not part of PR1.

**Homepage (`/dashboard`) — role-adaptive executive home:** KPI cards, pending approvals, recent activity, quick actions, notifications — all sourced from **existing** hooks/RPCs (e.g. `hr_dashboard_stats()`, notifications, approvals inbox). No new business data; aggregation/presentation only.

## 4. Non-goals (explicitly out of PR1)
- No new business modules; no Analytics/Collections/Permissions **pages** invented (see Decision 1).
- No change to any frozen HRMS/Wave-1/Wave-2 business logic, schema, or RLS.
- No route deletion (only de-listing from nav); route cleanup is PR4.

## 5. Decisions (LOCKED — accepted 2026-07-22)
1. **Gap items** → **map to nearest, hide the rest.** Collections → `/finance/payments`; Permissions → within `/admin/roles` (labelled "Roles & Permissions"); Analytics → **omitted** from nav until a real page exists. **No new modules/pages built.**
2. **Duplicate surfaces** → **module versions canonical.** HRMS `/hrms/attendance` + `/hrms/employees`, CRM `/crm/referrals`. Legacy `/attendance`, `/employees`, `/referrals` **de-listed from nav**; their routes stay mounted (removal deferred to PR4).
3. **Homepage** → **one role-adaptive `/dashboard`** for all roles; Director View widgets fold in for director/super_admin.

## 6. Deliverables (on acceptance)
Contract extension + new Sidebar + role-adaptive homepage → unit tests (nav grouping/role-filter parity) → integration (every group renders, every leaf routes, responsive breakpoints) → docs (Navigation Documentation) → review → freeze → tag `v1.0-pr1-ui-nav`. Then **stop** for acceptance of PR1.
