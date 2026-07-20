# Wave 3 — Design Document (HRMS + Regulatory Affairs)

> **STATUS: DESIGN ONLY — NOT IMPLEMENTED.** No code, SQL, migrations, React, or API
> code is produced in this phase. These documents are the FRS/TDS/DB/UI/Workflow/
> Permission/API specification. Implementation begins only after explicit user approval.
> Wave 1 + Wave 2 are frozen (tag `v2.0-wave2-complete`); production untouched; staging only.

## 1. Scope

Wave 3 = **exactly two modules** (no others): **A) HRMS** and **B) Regulatory Affairs**.
Both are designed to enterprise depth (full process coverage) so the architecture supports
future expansion, even where a feature is not implemented in the first milestone.

## 2. Binding design principles (ERP Constitution)

- **Reuse before create; extend before replace.** Build on existing tables, don't duplicate.
- **No duplicate data.** The ERP is the single **System of Record**.
- **No destructive DB changes.** Additive / expand-contract only; backward compatible.
- **Everything configurable via the Administration module** — office timings, working days,
  weekly offs, grace/late/half-day/overtime rules, shift rules, holiday calendar, leave rules,
  payroll rules, statutory rates, regulatory templates/fees. **Nothing hardcoded.**
- **Reuse cross-cutting platform services:** Administration (roles/permissions/settings/feature-flags),
  Document Management, Knowledge Base, Notifications (email/SMS/WhatsApp/in-app), Audit Log
  (append-only), Reports. Permissions use the existing grant-based framework + `auth_role()`.

## 3. Reuse inventory (existing schema Wave 3 EXTENDS — verified on staging)

| Domain | Existing tables to extend (do NOT recreate) |
|---|---|
| HRMS | `profiles` (auth identity), `employee_details` (HR PII/operational), `attendance_days`, `attendance_punches`, `attendance_settings` |
| Regulatory | `licenses`, `authority_queries`, `soi_archive`, `soi_products`, `clients`, `projects` |
| Cross-cutting | `permissions`/`role_permissions`, `audit_log`, `documents`, `knowledge_*`, notifications infra, `organizations` |

## 4. Document map (this folder)

| Doc | Covers |
|---|---|
| `00_WAVE3_DESIGN_OVERVIEW.md` | This file — scope, principles, reuse, doc map, deliverables |
| `HRMS_01_FOUNDATION.md` | Company/Org setup, configurable HR Settings, Employee Master |
| `HRMS_02_TIME_ATTENDANCE_LEAVE.md` | Attendance/shifts, Leave management, Holiday calendar |
| `HRMS_03_PAYROLL_STATUTORY.md` | Salary structures, Payroll, PF/ESI/PT/TDS/Gratuity, Loans/Advances, T&E |
| `HRMS_04_TALENT_LIFECYCLE_EXPERIENCE.md` | Recruitment, Onboarding, Lifecycle, Performance, Training, Assets, ESS, Dashboards, Reports, Notifications, Permissions, Integration |
| `REGULATORY_AFFAIRS_DESIGN.md` | Full Regulatory Affairs module (FRS/TDS/DB/UI/Workflow/Permissions/API) |
| `WAVE3_IMPLEMENTATION_PLAN.md` | Milestones (features / DB / backend / frontend / testing / docs) — post-approval |

Each module doc contains, for its scope: **Functional Requirements (FRS)**, **Technical Design (TDS)**,
**Database Design** (tables, relationships, indexes, constraints, migration strategy, audit — as
**specification**, not executed SQL), **UI Design** (menu/nav/screens/forms/dashboards/mobile),
**Workflow Design**, **Permission Matrix**, and **API Design**.

## 5. Deliverables checklist

- [ ] HRMS — FRS, TDS, DB, UI, Workflow, Permission Matrix, API (docs 01–04)
- [ ] Regulatory Affairs — FRS, TDS, DB, UI, Workflow, Permission Matrix, API
- [ ] Configurability specification (all policies via Administration)
- [ ] Integration specification (CRM, Finance, DMS, KB, Attendance, Audit, Administration, Reports)
- [ ] Implementation plan broken into small milestones (post-approval)

## 6. Stop condition

Design documents only. **No implementation, no migrations, no SQL, no React, no API code.**
Await user review + approval before any implementation begins.
