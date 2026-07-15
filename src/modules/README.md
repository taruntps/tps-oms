# Feature Modules (V2)

Each business capability is a **module** that depends on `src/core/*` and owns its own
pages, hooks, and components. This directory establishes the V2 module boundaries.

During migration, existing feature code physically remains under `src/pages/*` and
`src/hooks/*` (so V1 is never broken); each module README below records the **mapping**
of current files → target module. Files migrate incrementally in build-verified commits.

## Modules

| Module | Status | Scope |
|---|---|---|
| `operations` | **Active** (mapping defined) | FSSAI project workflow, stages, attendance, tasks, dashboards, operations board |
| `regulatory` | Initial structure only | FSSAI licences, authority queries, SOI, compliance |
| `crm` | Initial structure only | Clients, referrals, contacts |
| `finance` | Initial structure only | Payments, invoicing, govt-fee tracking |
| `hrms` | Initial structure only | Employee master, leaves, payroll (HRM Phase 1 spec) |
| `certification` | Initial structure only | Certification body (NABCB) audits, scopes — future |

## Rules
- A module imports from `@/core/*` and its own folder only — **never** another module's internals.
- Cross-module needs go through Core (shared services/types) or explicit public APIs.
- All modules share the **same production database** during V1↔V2 coexistence; every
  schema change must be backward compatible.
