# HRMS Milestone M2 — Attendance — As-Built, UAT Checklist & Release Notes

> **Status:** Implemented on `staging`, awaiting user review/approval to FREEZE.
> Design: `HRMS_02_TIME_ATTENDANCE_LEAVE`, `HRMS_BUSINESS_RULES_AND_POLICY` §2/§5/§6, traceability AT-01…AT-12.
> Constitution: additive/EXPAND, reuse-before-create, nothing hardcoded, production untouched.

## 1. As-built

### Database (migration `089_hrms_m2_attendance`, applied to staging)
- **Reuse (untouched):** `attendance_punches` (immutable raw GPS/face punch), `attendance_days` (**derived VIEW** rollup), `attendance_settings` (legacy singleton).
- **New — evaluated status:** `hr_attendance_days` (employee_id, work_date unique; shift_id, day_type, status, first_in/last_out/worked_minutes, late/early_out/ot_minutes, is_regularized, remarks). Distinct from the punch-derived view.
- **New — shifts:** `hr_shifts` (catalogue; seeded General 09:00–18:00), `hr_shift_allocations` (effective-dated per employee).
- **New — workflows:** `hr_attendance_regularizations` (employee-raised missed/wrong-punch), `hr_attendance_corrections` (HR-applied edit trail), `hr_outdoor_duty` (OD/WFH, `mode`), `hr_overtime` (pre-approval + comp-off/paid).
- **New — ingestion:** `hr_attendance_device_events` (biometric schema; adapter deferred — no device yet).
- **Resolver:** `get_effective_shift(employee, date)` → allocated shift or null (caller falls back to policy).
- **Configurable rules (hr_policy_settings, editable in Administration):** office timing/grace/core (`attendance.shift.general`), working days, weekly off, full-day hours (M1 seeds) + `late_to_halfday`, `regularization_cap`, `awol_alert_days`, `ot_enabled`, `wfh_enabled`, `od_enabled`. **Nothing hardcoded.**
- **Security:** RLS on all 8 tables — request/day tables self-scoped (`employee_id = auth.uid()`) + approver/HR read; masters HR-write. **Audit** via `fn_audit_wave2` on all.

### Frontend (`src/modules/hrms/`, auto-registered via existing module)
- **My Attendance** (`/hrms/attendance/me`) — month rollup (in/out/worked/late/OT/status) from the punch view + `hr_attendance_days`; raise Regularization / OD-WFH / OT requests. Links to the **existing** punch page (`/attendance`) — GPS/face capture reused, not rebuilt.
- **Attendance (muster)** (`/hrms/attendance`) — team/all muster (profiles × view × `hr_attendance_days`), dept/status/search filters; HR day-correction (gated `attendance.manage`).
- **Approvals** (`/hrms/attendance/approvals`) — unified pending queue (regularization + OD/WFH + OT); Approve/Reject sets status/approver/decided_at; approving a regularization flags `hr_attendance_days.is_regularized`.
- **Shifts** (`/hrms/attendance/shifts`) — shift catalogue CRUD + effective-dated allocation.
- **Reports** (`/hrms/attendance/reports`) — per-employee monthly counts (present/absent/half/leave/OD/WFH/late/OT/worked).

## 2. Verification
- `tsc -b` ✅ · `vite build` ✅ (attendance lazy chunks) · `vitest` ✅ **10/10** (HRMS contract tests extended for M2: 10 permission keys, 9 routes, nav gating, uniqueness).
- **DB integration** ✅ — audit fired INSERT/UPDATE/DELETE on a regularization write; `get_effective_shift` resolves; configurable policies resolve; RLS self-scope + approver in place.
- **Backward compatibility** ✅ — punch flow + `attendance_days` view untouched; M1 + Wave 1/2 intact; all additive.

## 3. Integration confirmation (per your requirement 6)
| Integrates with | How |
|---|---|
| **Employee Master (M1)** | all attendance rows key `employee_id → profiles.id`; muster joins the employee directory |
| **Shift allocation** | `hr_shift_allocations` + `get_effective_shift` feed daily evaluation |
| **Existing punch records** | `attendance_punches` (raw) + `attendance_days` (view) are the read source; never rewritten |
| **Future Leave (M3)** | `hr_attendance_days.day_type='leave'/status='on_leave'` + comp-off from OT are the seams Leave will populate/consume (read-model boundary) |
| **Future Payroll (M4)** | LOP (absent/half-day), OT minutes, and present-days are exposed on `hr_attendance_days` for Payroll to read (Payroll never writes attendance) |

## 4. UAT Checklist (run on staging)
Sign in at https://tps-oms-staging.pages.dev:
- [ ] **My Attendance** (any employee) — month view shows punches/worked/status; link to punch page works.
- [ ] **Raise requests** — submit a Regularization, an OD/WFH, and an OT request; they appear as pending.
- [ ] **Approvals** (manager/hr) — see the pending queue; Approve one + Reject one (with note); statuses update; regularized day flags.
- [ ] **Muster** (hr/director) — team attendance list with filters; HR correct a day (correction recorded).
- [ ] **Shifts** (hr) — create a shift; allocate it to an employee (effective-dated).
- [ ] **Configurability** — in HR Settings change `attendance.late_to_halfday` or grace; confirm it saves (no hardcoding).
- [ ] **Permissions** — a manager cannot see salary/other-employee sensitive data; an executive sees only their own attendance.
- [ ] **Reports** — monthly summary renders per employee.
- [ ] **Audit** — after approvals/corrections, the Audit Log shows the events.

## 5. Release Notes — HRMS M2 (Attendance)
**Added:** Attendance management on top of the existing punch system — evaluated daily status (`hr_attendance_days`), shift catalogue + effective-dated allocation, regularization/correction/OD-WFH/overtime workflows with approvals, muster + reports. All rules configurable via Administration.
**Reused (unchanged):** `attendance_punches` (immutable raw punch), `attendance_days` (view), GPS/face punch capture.
**DB:** migration `089` (8 new tables + `get_effective_shift` + RLS + audit + configurable seeds).
**Compatibility:** backward-compatible; staging only; production untouched.
**Known/deferred:** biometric device adapter (schema ready, no device); automated daily-evaluation job to populate `hr_attendance_days` from punches+shift+policy (currently HR/muster-driven + on approval) — a scheduled evaluator is a follow-up; comp-off ledger consumption lands with Leave (M3).

## 6. Next milestone
On approval + freeze of M2, proceed to **M3 — Leave Management**. No progression without explicit approval.
