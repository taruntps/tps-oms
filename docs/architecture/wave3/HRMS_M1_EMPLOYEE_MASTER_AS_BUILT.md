# HRMS Milestone M1 — Employee Master — As-Built, UAT Checklist & Release Notes

> **Status:** ✅ APPROVED & FROZEN (2026-07-20), tag `v3.0-hrms-m1`. Do not modify except critical defects.
> Design source: `HRMS_01_FOUNDATION`, `HRMS_BUSINESS_RULES_AND_POLICY`, `WAVE3_TRACEABILITY_MATRIX` (EM-01…EM-12).
> Constitution: additive/EXPAND only, reuse-before-create, nothing hardcoded, production untouched.

## 1. As-built — what shipped

### Database (migration `088_hrms_m1_employee_master`, applied to staging)
- **Configurable policy framework:** `hr_policy_settings` (typed/scoped/effective-dated) + `get_hr_policy(key, employee_id)` resolver (Company→Branch→Department→Grade→Employee, most-specific-wins). Seeded editable defaults: office timing 09:00–18:00 (60-min break, core 11–16, 10-min grace), Mon–Fri, Sat+Sun off, full-day 8h, probation 6mo, employee-code format. **No policy hardcoded.**
- **Minimal org masters:** `hr_grades`, `hr_departments`, `hr_designations`, `hr_employment_types` (seeded permanent/contract/intern/consultant/probation).
- **Reuse/extend:** `profiles` gains FK-shadow cols (`department_id/designation_id/grade_id/employment_type_id/branch_location_id/reports_to`) — existing text `designation`/`department` kept (expand-contract). `employee_details` gains `gender, marital_status, blood_group, nationality, photo_url, signature_url, probation_end_date, confirmation_date, employee_status`. `organizations`/`office_locations` reused as company/branch.
- **Employee child/history (10 tables):** bank, statutory IDs, nominees, emergency contacts, qualifications, experience, skills, family, medical, status-events (lifecycle history).
- **Security:** RLS via `auth_role()` on all 15 tables; employee child rows self-scoped (`employee_id = auth.uid()`); masters read by people-ops roles, write by hr/director/super_admin. **Audit** via `fn_audit_wave2` on all HR tables → append-only `audit_log`.
- **Permissions:** `hrms.config.manage`, `hrms.employee.view`, `hrms.employee.manage`, `hrms.employee.view.self`, `hrms.employee.sensitive.view` + role grants (hr full, manager/auditor read, executive/accounts self).

### Frontend (`src/modules/hrms/`, registered in `core/registry` + sidebar)
- **Employees directory** (`/hrms/employees`) — code/name/designation/department/status/joined, search + filters, New Employee (gated `hrms.employee.manage`).
- **Employee detail** (`/hrms/employees/:id`) — tabs: Profile, Employment, Bank, Statutory IDs, Nominees, Emergency, Qualifications, Experience, Skills, Family, Medical, Lifecycle (read-only timeline). **Bank/Statutory/Medical gated by `hrms.employee.sensitive.view`.**
- **Employee create/edit** — create **reuses `admin_create_user`** (auth provisioning; email+temp password+role) then applies org FK refs + `employee_details`; edit updates profile+details directly.
- **Org Setup** (`/hrms/setup/org`) — CRUD for departments/designations/grades/employment-types (soft-deactivate to preserve FKs), gated `hrms.config.manage`.
- **HR Settings** (`/hrms/setup/policies`) — manage `hr_policy_settings` (key/scope/value/effective date) — the single configurable source of HR policy.

## 2. Verification (validation, unit + integration)
- `tsc -b` ✅ clean · `vite build` ✅ (HRMS lazy chunks) · `vitest` ✅ **9/9** (incl. 4 new HRMS contract tests: key, 5 permission keys, 4 routes, nav gating).
- **DB integration** ✅ — audit trigger fired INSERT/UPDATE/DELETE on an HR child write; `get_hr_policy` resolves seeded defaults; RLS + self-scope in place.
- **Backward compatibility** ✅ — all changes additive; existing `profiles`/`employee_details`/attendance untouched; Wave 1/2 intact.

## 3. UAT Checklist (for the user to run on staging)
Sign in at https://tps-oms-staging.pages.dev (as **hr**/**director**/**super_admin**):

- [ ] **Directory** — `/hrms/employees` lists existing staff with department/designation/status.
- [ ] **View employee** — open a record; all tabs render; Lifecycle timeline shows (empty if no events).
- [ ] **Edit employee** — change profile + PII fields; save; reload shows persisted values.
- [ ] **Child records** — add a qualification / experience / nominee / emergency contact; edit; delete.
- [ ] **Sensitive gating** — as a **manager** (no `sensitive.view`), confirm Bank/Statutory/Medical tabs are hidden; as **hr**, confirm visible.
- [ ] **Create employee** — New Employee → email + temp password + role + details → creates a working login (verify the new user can sign in) and appears in the directory.
- [ ] **Org Setup** — add a department/designation/grade; assign to an employee.
- [ ] **HR Settings (configurability)** — change the office-timing or working-days policy value; confirm it saves (proves no hardcoding).
- [ ] **Permissions** — an **executive** sees only their own record (ESS view.self), not the full directory.
- [ ] **Audit** — after edits, the Audit Log shows the employee events.

## 4. Release Notes — HRMS M1 (Employee Master)
**Added:** HRMS module with Employee Master (full profile + 10 child/history sections), Org Setup masters, and a fully configurable HR-policy framework (nothing hardcoded). New-employee creation reuses the existing `admin_create_user` provisioning. Role-based access with sensitive-PII gating and immutable audit.
**Changed (additive):** `profiles` + `employee_details` extended with new nullable columns (existing columns/behaviour unchanged).
**DB:** migration `088` (15 `hr_*` tables + extensions + `get_hr_policy` + RLS + audit + seeds).
**Compatibility:** backward-compatible; staging only; production untouched.
**Known/deferred to later milestones:** broader org setup (divisions/teams/business-units/cost-centres, approval-chain builder) lands with the milestones that first require it; photo/signature upload wiring to Document Management is stubbed (URL fields present); employee-code auto-generation from policy is a follow-up (manual/optional now).

## 5. Next milestone
On approval + freeze of M1, proceed to **M2 — Attendance** (per the approved build order). No progression without explicit approval.
