# HRM — Phase 1 (Employee Master + Leaves + Payroll) — Design Spec

**Date:** 2026-06-28
**Project:** TPS-OMS (portal.tpsxpert.com)
**Status:** Design approved by user. Implementation NOT started — awaiting user's go-ahead (user asked to pause and resume later).

## Goal

Build an in-house HRM on the existing stack (React/Vite + TypeScript + Supabase/Postgres),
inspired by — and better than — the reference repo `taruntps/HRM` (which is FastAPI + MongoDB +
Emergent-hosted auth/storage). No new stack, no Emergent, no Mongo, no FastAPI. Reuse Supabase
Auth, RLS, existing attendance/face-match, ZeptoMail, SheetJS, and the design system.

Phase 1 = **Employee Master + Leaves + Payroll** (the full operational core), built and shipped
in three sub-phases.

## Why not reuse the reference repo

Different stack (FastAPI/Mongo), hard dependency on Emergent's demo auth + object storage, and a
CORS security hole (`allow_credentials=True` with wildcard origin). The one genuinely valuable
asset is its **payroll math** (`backend/payroll_calc.py`) — accurate Indian payroll — which we
port to TypeScript. Everything else is rebuilt natively.

## Key decisions (from brainstorming)

1. **Every employee gets a login.** Employee-code + password when they have no personal email (or
   a shared/common email), reusing the portal's existing employee-code login (`admin_create_user`).
2. **Employee data model:** a new `employees` table holds the HR master, linked 1:1 to a `profiles`
   login. Keeps auth/profile lean; HR/statutory/compensation data lives in `employees`.
3. **Statutory scope:** PF, ESI, TDS only (NO Professional / Punjab Development Tax). Each of
   PF/ESI/TDS is **per-employee optional** (applicability flag) AND has a **per-employee "show on
   payslip" toggle**. This is a deliberate improvement over the reference (which forced statutory
   globally).
4. **Paid days:** auto-computed from existing attendance + approved leaves + holidays/week-offs
   (unapproved absence → LOP), with **HR override** before a payslip is finalised.
5. **Outputs:** TPS-branded **PDF payslip** per employee (emailable via existing ZeptoMail) +
   monthly **Excel salary register** + **PF/ESI/TDS summary** sheets (SheetJS). One new client-side
   dependency: **jsPDF** for payslips.
6. **Build order:** Employee Master → Leaves → Payroll, each its own plan + deploy.

## Data model (new tables, all RLS-enabled)

### `employees` (1:1 with `profiles`)
- `id` uuid pk, `profile_id` uuid fk→profiles (unique), `employee_code` (mirrors profiles), `status`
  (active/on_notice/exited), `employment_type` (full_time/part_time/contract/intern).
- Personal/work: `designation`, `department`, `date_of_joining`, `date_of_birth`, `gender`,
  `manager_id` (→profiles/employees), `location`.
- Statutory IDs: `pan`, `aadhaar`, `uan`, `pf_number`, `esi_number`, `bank_account`, `ifsc`.
- Compensation: `ctc_annual` numeric, `basic_monthly` numeric (0 ⇒ derive 40% of CTC/12).
- Statutory flags: `pf_applicable` bool, `esi_applicable` bool, `tds_applicable` bool,
  `show_pf_on_slip` bool, `show_esi_on_slip` bool, `show_tds_on_slip` bool.
- `created_at`, `updated_at`.

### Leaves
- `leave_types`: `code`, `name`, `annual_quota` numeric, `is_paid` bool, `active` bool.
- `leave_balances`: `employee_id`, `year`, `leave_type_code`, `allotted`, `used`, `updated_at`.
- `leave_requests`: `employee_id`, `leave_type_code`, `from_date`, `to_date`, `days`, `reason`,
  `status` (pending/approved/rejected/cancelled), `approver_id`, `approver_comment`, timestamps.
- `holidays`: `date` (unique), `name`, `type` (national/festival/regional/optional).

### Payroll
- `payroll_config` (singleton): PF rates + ₹15k cap flag, ESI rates + ₹21k ceiling, TDS new-regime
  FY25-26 slabs, standard deduction, cess, salary-split percentages. Editable by admin; defaults
  ported from the reference repo.
- `payroll_runs`: `month` (1-12), `year`, `status` (draft/finalised/paid), `created_by`, timestamps.
- `payslips`: `run_id`, `employee_id`, `employee_code`, `employee_name`, `period_month`,
  `period_year`, `working_days`, `paid_days`, all earnings (basic/hra/conveyance/medical/special/
  other/gross), all deductions (pf_employee/pf_employer/esi_employee/esi_employer/tds/other/total),
  `net_pay`, `status` (draft/approved/paid), snapshot of which components are shown.

## Modules

### 1. Employee Master
- **Employees** page (super_admin/director/accounts): searchable list; add/edit; detail with tabs
  **Personal · Statutory · Compensation · Documents**.
- Adding an employee optionally provisions their `profiles` login via the existing employee-code
  `admin_create_user` flow.
- Document upload reuses the existing client-documents storage pattern (PDF/JPEG).

### 2. Leaves
- HR-configurable `leave_types` + quotas (defaults: CL/SL/EL/ML/PL/COMP_OFF/LOP — actual numbers
  set by HR).
- **Self-service:** employee applies from their own login → **manager approves** (existing
  `manager_id`); HR/admin can approve/override. Balance auto-decrements on approval; restored on
  cancel/reject.
- Holiday calendar managed by HR; feeds payroll paid-days and leave validation.

### 3. Payroll
- **Engine:** port `payroll_calc.py` → `src/lib/payroll.ts` as pure TypeScript functions
  (split_salary, compute_pf, compute_esi, compute_tds_monthly, compute_payslip, gratuity).
  **Unit-tested with vitest.** Per-employee PF/ESI/TDS applicability respected; PT excluded.
- **Paid days:** computed from attendance + approved leaves + holidays/week-offs; LOP for
  unapproved absence; HR override per employee per run.
- **Run flow:** select month → generate draft payslips for active employees → review/override →
  finalise → optional email.
- **Outputs:** branded PDF payslip (jsPDF) emailable via ZeptoMail; Excel salary register +
  PF/ESI/TDS summary sheets (SheetJS).

## Roles, permissions, RLS

- Reuse existing roles. **Employees + Payroll**: super_admin / director / accounts only.
- **Leaves**: all staff self-serve; managers approve their reports.
- **Employee self-view**: employees see only their own payslips + leave records, RLS-enforced
  (same pattern as attendance).

## Tech additions & testing

- New dependency: **jsPDF** (payslip PDFs), client-side, no server.
- Reuse: SheetJS (Excel), ZeptoMail (email), Supabase Storage (documents), attendance data.
- **Testing:** payroll engine fully unit-tested (vitest). Each module verified on the live DB with
  probe-insert-assert-cleanup + `npm run build` before deploy. Subagent-driven implementation with
  spec + quality review per task, as with the face-match feature.

## Defaults chosen (user may revise)

- Leave quotas are HR-configurable; HR sets the actual numbers.
- Employees self-apply for leave.
- Emailing payslips is opt-in per payroll run.

## Out of scope (Phase 1)

- Performance (KRA) and Recruitment modules — separate later phases.
- Professional / Punjab Development Tax.
- Government e-filing file formats (EPFO ECR, ESIC return, TRACES FVU) — Phase 1 ships
  reconciliation **summaries** (Excel), not filing-ready exports.
- Replacing the existing attendance/face-match (already superior to the reference).
