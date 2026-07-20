# Wave 3 — Implementation Plan (Milestones)

> **DESIGN ONLY — implementation begins only after user approval.** Staging branch only;
> production untouched; additive/expand-contract; reuse-before-create; everything configurable
> via Administration. Each milestone is independently shippable + testable (like Wave 1/2 waves).
> Sequencing (HRMS-first vs Regulatory-first vs interleaved) is a decision for approval — the
> default below is **HRMS first, then Regulatory**, since HRMS is broader and unblocks payroll/ESS.

## Milestone template
Every milestone delivers: **Features · Database (additive migrations) · Backend (RPCs/edge/RLS/permissions) · Frontend (module + routes + nav) · Testing (unit + UAT) · Documentation (as-built) · Deliverables**. Each ends green (`tsc -b` + `vite build` + tests), staging-verified, and committed with a milestone tag.

---

## Part A — HRMS

### HRMS-M1 · Foundation + Employee Master  *(design: HRMS_01)*
- **Features:** Company/Org config (branches, departments, designations, grades, employment types, reporting & approval hierarchy); configurable HR settings via Administration (`hr_policy_settings` resolver); Employee Master (extend `employee_details` + child/history tables).
- **DB:** org master tables + `hr_policy_settings`; additive columns on `employee_details`/`profiles`; audit triggers.
- **Backend:** `get_hr_policy` resolver; permission keys `hrms.employee.*`, `hrms.config.*`; RLS.
- **Frontend:** `src/modules/hrms/` — Org setup, HR Settings, Employee directory + profile.
- **Testing:** config resolution (most-specific-wins), employee CRUD, PII permission gating.
- **Deliverable:** Employee Master live; policies configurable; no hardcoding.

### HRMS-M2 · Attendance + Leave  *(design: HRMS_02)*
- **Features:** attendance rules/shifts/corrections (extend existing `attendance_*`), leave types/balances/accrual/approval, holiday calendar.
- **DB:** additive on `attendance_settings`/`attendance_punches`; new shift + leave + ledger tables.
- **Backend:** shift resolver, leave-balance ledger RPCs, approval workflow, correction workflow.
- **Frontend:** attendance views, leave apply/approve, calendars.
- **Testing:** accrual/carry-forward/sandwich rules; approval chains; backward-compat with existing punch flow.

### HRMS-M3 · Payroll + Statutory  *(design: HRMS_03)*
- **Features:** salary structures/CTC, payroll run, PF/ESI/PT/TDS/Gratuity (configurable rates), payslips, bank file, statutory registers; Finance handoff for payout.
- **DB:** salary structure/components, payroll runs, payslips, statutory config, loans, reimbursements (money = paise).
- **Backend:** payroll calculation engine (inputs from M2), statutory computation, Finance payout handoff (`payments`), immutable approved runs.
- **Frontend:** payroll run console, payslip viewer, ESS payslips, salary admin (confidential).
- **Testing:** end-to-end payroll run vs expected; statutory edge cases; confidentiality/audit.

### HRMS-M4 · Talent + Lifecycle + Performance  *(design: HRMS_04 §1–4)*
- **Features:** recruitment (requisition→offer), onboarding, lifecycle events (probation→F&F), performance (goals/reviews/recommendations).
- **DB:** recruitment, onboarding, lifecycle/separation/F&F, performance tables.
- **Backend:** approval workflows, F&F compute (Payroll+Finance), letter generation (DMS templates).
- **Frontend:** recruitment pipeline, onboarding checklist, employee lifecycle tab, performance module.
- **Testing:** offer→provision employee; exit→asset clearance→F&F→payout; review cycle.

### HRMS-M5 · Training + Assets + ESS + Dashboards  *(design: HRMS_04 §5–11)*
- **Features:** training/certification tracking, asset register, Employee Self Service, Manager + HR dashboards, HR reports, notifications.
- **DB:** training, certifications, assets, allocations.
- **Backend:** certification-expiry scan, notification triggers (reuse `pg_cron`/edge), report views.
- **Frontend:** ESS portal, manager/HR dashboards, reports.
- **Testing:** self-scoped ESS RLS; dashboard scoping; reminder scheduling.

---

## Part B — Regulatory Affairs  *(design: REGULATORY_AFFAIRS_DESIGN)*

### REG-M1 · Regulatory Projects + Product/Ingredient Master + Licences
- Extend `licenses`; product/ingredient masters; client regulatory profiles; licence lifecycle + renewals.

### REG-M2 · Submissions + Authority Queries + Government Fees
- Extend `authority_queries` (query→response→resolution); FoSCoS submission tracking; `finance_govt_fees` integration; approvals/renewals pipelines.

### REG-M3 · Label & Claims Review + SOI + Compliance Calendar
- Extend `soi_archive`/`soi_products`; label/claims review (checklist-driven, versioned via DMS); regulatory calendar; Form II / NSF.

### REG-M4 · Compliance Dashboard + Templates + Reports + Automation
- Compliance dashboard (obligations/overdue/health), configurable templates, reports/analytics, workflow automation (reminders/escalations via Notifications + scheduled jobs).

---

## Cross-cutting (every milestone)
- **Permissions** seeded into Administration; **audit** on all business tables; **notifications** reuse existing infra; **reports** via Reports module; **documents** via DMS. No duplicate data. Backward compatibility verified against Wave 1/2. Production untouched.

## Open questions to confirm before implementation
1. **Build order** — HRMS-first (default), Regulatory-first, or interleaved?
2. **HRMS depth for the first shippable milestone** — full M1–M5, or start M1–M3 (Employee/Attendance/Leave/Payroll) and defer M4–M5?
3. **Statutory config values** — PF/ESI/PT/TDS/gratuity rates + PT state (Punjab) slabs to seed (or seed placeholders + configure in Administration).
4. **Regulatory** open items flagged in `REGULATORY_AFFAIRS_DESIGN` (fee schedule values, import-licence tiering, claims-rule granularity, export-doc bundle scope, client-health scoring formula).
5. **Recruitment external posting / candidate portal** — confirmed OUT of scope (internal ERP only); design keeps the interface but no external portal is built.
