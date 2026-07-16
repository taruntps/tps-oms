# TPS Enterprise Platform — Master Architecture (V2)

**Status:** Finalized (Phase A). Governs Operations migration, Core Platform, and all 15 module designs.
**Scope:** Single-tenant enterprise platform for TPS Xperts Group (FSSAI/nutraceutical regulatory consultancy). **Scope v2.0:** TPS Xperts Global Certification (NABCB certification body) is a separate legal entity and a **separate future platform** — the Certification module and the Management System / QMS module are **out of scope** here (see §9).
**Stack:** React 18 + Vite 5 + TypeScript · React Router v6 · TanStack Query · Radix + Tailwind ("Arctic Precision") · Supabase (Postgres + RLS + Auth + Storage + Edge Functions) · Cloudflare Pages (staging) / GitHub Pages (prod).

---

## 1. Architectural principles

1. **Modular monolith, not microservices.** One deployable frontend + one Supabase project. Modules are *logical* boundaries (folders + DB schemas + RLS), not separate services. This matches a small team and keeps ops simple while enforcing clean seams.
2. **Core is the only shared dependency.** Feature modules depend on `@/core/*` and their own folder — never on another module's internals. Cross-module needs go through Core services or a module's explicit public API (`index.ts`).
3. **Security lives in the database.** Every table has RLS. The frontend never enforces authorization it can bypass; it *reflects* permissions the DB guarantees. `has_role()` / `auth_role()` + a granular permission layer are the single source of truth.
4. **Backward-compatible, expand-contract schema.** V1 and V2 share the same production database during coexistence. Every schema change is additive first (expand), migrate readers/writers, then remove (contract) — never a destructive in-place change.
5. **Design before code.** No module is implemented until its design doc (§6 template) is approved. This document + the per-module docs are the contract.
6. **Everything observable is code-split.** Route-level and heavy-dependency lazy loading is the default (already delivering the 474 KB initial bundle).

---

## 2. Finalized folder structure

```
src/
  core/                        # Shared platform — the ONLY cross-module dependency
    auth/                      # Session, login, idle-logout, face-login client
    access/                    # Roles, permissions, guards, RoleGuard, permission hooks
    notifications/             # In-app notifications + dispatch adapters (email/WhatsApp)
    files/                     # Storage + Google Drive abstraction, upload widgets
    ui/                        # Design system: Sym, Toast, ErrorBoundary, ClockBadge, layout shell
    hooks/                     # Cross-cutting hooks (useTheme, useDebounce, useMediaQuery…)
    utils/                     # Formatting, dates, projectClock, geo, cn()
    data/                      # Static reference data (india states/cities)
    types/                     # Shared/global types, generated DB types
    supabase.ts                # Client singleton
    registry.ts                # Module registry (nav, routes, permissions) — see §4

  modules/
    <module>/                  # One folder per business capability
      pages/                   # Route components (lazy-loaded)
      components/              # Module-private components
      hooks/                   # Module data hooks (React Query)
      api/                     # Typed data-access functions (thin Supabase wrappers)
      types.ts                 # Module domain types
      permissions.ts           # Module permission keys
      routes.tsx               # Module route table (consumed by registry)
      nav.ts                   # Module nav entries (consumed by registry)
      index.ts                 # PUBLIC API — the only thing other layers may import

  app/
    App.tsx                    # Providers + router assembly from the registry
    router.tsx                 # Builds routes from registry
    shell/                     # AppShell, Sidebar, TopBar (consume registry nav)
```

**Import rules (enforced by convention + ESLint boundary rule later):**
- `core/*` imports only from `core/*`. Never from `modules/*`.
- `modules/A/*` imports from `@/core/*` and `modules/A/*` only.
- Cross-module: `modules/B` may import `modules/A`'s **`index.ts`** public API only (rare; prefer Core).

---

## 3. The Core Platform (shared services)

| Core area | Responsibility | Public surface (examples) |
|---|---|---|
| `core/auth` | Supabase session lifecycle, login by email/employee-code, idle logout, face-login | `useAuth()`, `AuthProvider`, `signIn`, `signOut` |
| `core/access` | Role enum, granular permission keys, guards | `useCan(permission)`, `<RoleGuard>`, `hasRole()`, `PERMISSIONS` |
| `core/notifications` | In-app notifications feed + dispatch (email via ZeptoMail, WhatsApp via BSP) — **gated by settings flags** | `useNotifications()`, `notify()`, `<NotificationPanel>` |
| `core/files` | Supabase Storage + Google Drive unified file API, upload widget | `useDrive()`, `uploadFile()`, `<DriveTab>`, `<FileUpload>` |
| `core/ui` | Design system + app shell | `<Sym>`, `toast()`, `<ErrorBoundary>`, `<AppShell>`, `<DataTable>`, `<StatCard>` |
| `core/hooks` | Cross-cutting hooks | `useTheme`, `useDebounce`, `useUrlFilters`, `usePaginatedQuery` |
| `core/utils` | Pure helpers | `formatDate`, `formatRupees`, `cn`, `clockBucket`, `haversine` |

**Notifications contract (used by every module):** a module never talks to email/WhatsApp directly. It calls `notify({ userId, type, title, body, ref, channels })`. Core decides delivery based on `reminder_settings` / `app_settings` flags — so staging stays sandboxed and prod respects user preferences.

---

## 4. Module registry (how modules plug in)

`core/registry.ts` is the assembly point. Each module exports `routes`, `nav`, and `permissions`; the registry composes them so `App`/`Sidebar`/`Router` never hard-code module knowledge.

```ts
// core/registry.ts
import type { ModuleDef } from './types'
export const MODULES: ModuleDef[] = [
  operationsModule,   // from modules/operations
  hrmsModule,
  // …added as each module ships
]
// Router builds <Route> tree from MODULES[].routes
// Sidebar builds nav from MODULES[].nav, filtered by useCan()
// Access layer aggregates MODULES[].permissions into PERMISSIONS
```

```ts
// modules/<x>/index.ts  (public API)
export const xModule: ModuleDef = {
  key: 'operations',
  nav,            // sidebar entries (with required permission + icon)
  routes,         // lazy route components
  permissions,    // permission keys this module defines
}
```

Adding a module = write it + append one line to `MODULES`. No edits to shell/router internals.

---

## 5. Cross-cutting standards (every module obeys)

- **Data access:** module `api/*` functions are thin typed wrappers over the Supabase client; hooks (`hooks/*`) wrap them in React Query with stable query keys `[module, entity, …params]`. staleTime 60s default.
- **Permissions:** every mutation is guarded twice — RLS in the DB (authoritative) + `useCan()` in the UI (for affordance). Permission keys namespaced: `operations.project.create`, `hrms.leave.approve`.
- **Notifications:** via `core/notifications` only, typed `notification_type` enum extended per module.
- **Files:** via `core/files`; buckets per domain (`documents`, `hr-docs`, `certification`, …) with RLS storage policies.
- **Audit:** state-changing actions write to `audit_log` (who/what/when/before/after) via a shared helper or DB trigger.
- **Automations:** scheduled work = pg_cron → Edge Function (gated by settings); event work = DB triggers → `notify()`.
- **Errors:** all async wrapped; user-facing errors via `toast()`; never silent catches.
- **URLs & filters:** list state (tab/filter/search/page) persisted in the URL via `useUrlFilters`.

---

## 6. Module design template (the deliverable for each of the 15 modules)

Every module design doc (`docs/architecture/modules/<module>.md`) MUST contain, in this order:

1. **Purpose & scope** — what business capability, who uses it, what it explicitly does NOT do.
2. **Business workflow** — the end-to-end process(es) as numbered steps + a mermaid flowchart, grounded in TPS's real operations.
3. **Screen flow** — screens/routes and how users move between them (mermaid state/flow diagram) + a screen inventory table.
4. **Database design** — tables, key columns, types, relationships, enums; a mermaid **ER diagram**; RLS intent per table; expand-contract notes.
5. **API design** — the module's `api/*` functions + any RPCs/Edge Functions: name, inputs, outputs, authz.
6. **Permissions** — permission keys, which roles hold them by default, RLS mapping.
7. **Dashboard** — the module's dashboard widgets/KPIs and their data sources.
8. **Reports** — report list, columns, filters, export formats.
9. **Notifications** — event → notification type → recipients → channels.
10. **Automations** — scheduled + event-driven jobs, triggers, cron cadence.
11. **Integrations** — external systems (Razorpay, ZeptoMail, WhatsApp BSP, Google Drive/Sheets, FSSAI FoSCoS, NABCB, e-sign, etc.) and the boundary/adapter.
12. **Future scalability** — what changes at 10×; multi-entity/tenant; performance; data volume.
13. **Architecture diagram** — a mermaid component diagram showing the module ↔ Core ↔ DB ↔ integrations.

Diagrams use **mermaid** (renders in GitHub + our artifacts). ER diagrams use `erDiagram`; flows use `flowchart`/`stateDiagram-v2`; architecture uses `flowchart`/`graph`.

---

## 7. The 15 feature modules + Core (portfolio map)

> **Scope v2.0:** Certification (row 8) is **removed** — the Certification Body is a separate legal
> entity and a separate future platform. **Expenses & Travel** is a **sub-domain of HRMS + Finance**,
> not a standalone module. Result = **Core + 15 feature modules** (number 8 retired; gap kept so
> cross-references stay valid). See `02_ENTERPRISE_ARCHITECTURE_VALIDATION.md` (top note) and §9.

| # | Module | Anchor entity | Primary users | Note |
|---|---|---|---|---|
| 1 | **Operations** (migrate first) | Project, Stage | Executives, Managers, Directors | Existing V1 feature → module |
| 2 | HRMS | Employee, Leave, Payroll, Attendance | HR, Directors | Attendance already partly built; hosts T&E claim/travel sub-domain |
| 3 | CRM | Lead, Client, Referral, Contact | Sales, Managers | Clients/referrals exist → absorb |
| 4 | Marketing | Campaign, Content, Audience | Marketing | New |
| 5 | Sales | Deal, Quotation, Order | Sales, Directors | New; feeds Operations & Finance |
| 6 | Finance & Accounts | Invoice, Payment, Govt-fee, Ledger | Accounts, Directors | Payments exist → absorb; hosts T&E payout/bill-to-client sub-domain |
| 7 | Regulatory | Licence, Authority query, SOI, Compliance | Executives, Regulatory | FSSAI/FSSR domain |
| 9 | Document Management | Document, Folder, Version | All | Drive + storage → formalize |
| 10 | Knowledge Base | Article, Category | All | Exists → absorb |
| 11 | Learning Management (LMS) | Course, Lesson, Quiz, Enrolment | HR, All | New; FoSTaC-style training |
| 12 | AI Assistant | Conversation, Tool, Prompt | All | Regulatory Q&A, doc drafting |
| 13 | Customer Portal | Client-facing project/doc/invoice views | External clients | New external surface |
| 14 | Vendor Portal | Vendor, PO, Vendor-doc | External vendors | New external surface |
| 15 | Administration | User, Role, Setting, Audit, Integration config | Super admin, Directors | User mgmt/settings → formalize |
| 16 | Reports & Analytics | Cross-module report, KPI, Export | Directors, Managers | Cross-cutting reporting layer |

(Operations = migration target of Phases B/C; the rest = design-only in Phase D, coded after approval.)

---

## 8. Migration strategy (Phases B & C — no breakage)

**Shim-and-move**, build-verified per step, committed incrementally:
1. Create `core/*` and `modules/operations/*` real files by **re-exporting** from current locations (zero behavior change).
2. Move implementation into the new home; leave a re-export shim at the old path so existing imports keep working.
3. Flip imports to the new `@/core/*` / module paths module-by-module.
4. Remove shims once no importer remains.
5. `npm run build` + `npm test` green after every step; commit.

Production DB is **never** touched by this refactor (frontend-only). The staging branch is the only target.

---

**Next:** Phase D designs (parallel, one doc per module, following §6) → then Phase B/C code migration → then approval gate before coding new modules.

---

## 9. Validation-driven amendments (v1.1)

Adopted from the Enterprise Architecture Validation (`02_ENTERPRISE_ARCHITECTURE_VALIDATION.md`, the binding amendment layer). These override any conflicting detail in earlier sections or module docs:

- **Permission helper is `has_perm(key[, scope])`** — one canonical name/signature; `has_permission(uid,key)` is retired. All module RLS must call `has_perm` verbatim.
- **Role model is grant-based, not enum-based** — `roles(role_key)` + `user_roles(user_id, role_key)` many-to-many; `has_role()` reads grants. The `user_role` enum is kept only for expand-contract compatibility. Functional sub-roles (cert/marketing/L&D/procurement) are role_keys, not enum values.
- **Permissions carry a data-scope** (`own | team | all`) in `role_permissions`, consumed by `has_perm(key, scope)` and shown in the admin matrix. **Delegation** (time-boxed) and **`*.export`** are first-class.
- **Schema strategy: single `public` schema + table prefixes** (no per-module Postgres schemas) — avoids cross-schema RLS/GRANT/search_path escalation risks.
- **One `organizations` master** (Admin/Core) for the two legal entities; **one Core numbering service** (per-series advisory locks) owns all sequences. Finance's `legal_entities` and per-module code generators are retired.
- **One Core `approvals` entity** (polymorphic ref + assignee + decision + SLA) backs the single Approvals inbox; modules register approvals instead of rolling their own.
- **One Core external-identity service** parameterized by tenant key (`client_id`/`vendor_id`) shared by both portals.
- **`notification_type` is a lookup table**, not a platform-wide enum. **SMS** is a second live channel in `core/notifications`.
- **Money is `bigint` paise** platform-wide (verified against the live DB).
- **Scalability rules:** wrap RLS permission helpers in `(select …)` InitPlan form; a read-replica/branch target serves analytics + AI retrieval; `pg_cron` jobs are staggered with per-job statement timeouts; `audit_log` is partitioned by month with retention. Cron/Edge jobs use a **scoped automation identity**, not `service_role`.
- **Mobile-first + offline** is a platform commitment for field-facing surfaces (attendance punch, document capture) with a dedicated mobile nav model.
- **Scope v2.0 (TPS Platform V2 Constitution) — supersedes the v1.1 module count.** Final scope is
  **16 = Core + 15 feature modules.** The **Certification Body is removed** from this platform
  (separate legal entity → separate future platform), so the **Certification** module and the
  **Management System / QMS** module are **out of scope**. **Expenses & Travel** is **folded into
  HRMS + Finance** as a sub-domain, not a standalone module. (This replaces the earlier "module count
  is 17" figure.) Reserved Certification/QMS docs live in `_reserved-certification-platform/`.
