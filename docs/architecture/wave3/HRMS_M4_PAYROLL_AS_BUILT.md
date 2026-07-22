# HRMS Milestone M4 — Payroll — As-Built, UAT Checklist & Release Notes

> **Status:** ✅ APPROVED & FROZEN (2026-07-22), tag `v3.0-hrms-m4`. Do not modify except critical defects.
> Design baseline (frozen, tag `v3.0-hrms-m4-design`): calc spec + data-model spec + process-flow spec.
> Acceptance basis: `PAYROLL_TEST_SCENARIO_MATRIX`. Constitution: additive/EXPAND, reuse-before-create,
> nothing hardcoded, money=paise, Finance disburses (no auto-GL), frozen M1/M2/M3 untouched.

## 1. As-built
- **DB (migration 093):** 21 tables — component master, effective-dated `hr_statutory_config` (placeholder-seeded), salary structures + effective-dated `hr_employee_salary` + `hr_salary_revisions`, payroll runs/lines/component-lines/statutory, payslips, variable pay/reimbursements/arrears/loans/schedule/adjustments, finance handoff + bank advice. Money=paise; salary/payroll **RLS-confidential** (hr/director/super_admin; payslip self); audit `fn_audit_wave2`.
- **Engine (`api/payroll.ts`):** deterministic **bigint-paise** pure functions — `computeComponents` (fixed→percent→balancing), `applyLop`, `computeStatutory` (PF→ESI→PT→TDS), `roundNet`, orchestrated by `computeLine`; run ops `createRun/computeRun/validateRun/approveRun/rejectRun/lockRun/generatePayslips`. Reads config from `hr_component_master`/`hr_statutory_config`/`get_hr_policy` — **nothing hardcoded**; placeholder statutory → 0.
- **Frontend:** Component Master, Salary Structures (+ effective-dated assignment + revisions), Statutory Config (effective-dated editor), Payroll Runs, **Run Detail** (register + component/statutory breakdown, validation exceptions, approve+lock, Finance handoff, bank advice), Payslips (ESS self / HR all).
- **Permissions:** `hrms.salary.view/manage`, `hrms.payroll.process/approve/view`, `hrms.payslip.self`. **SoD:** `approveRun` enforces creator ≠ approver; approve/lock gated to `payroll.approve` (director/super_admin), create/compute to `payroll.process` (hr).

## 2. Decisions honoured
- Statutory = **placeholder-seeded, effective-dated + versioned** (Administration configures actual values; engine invents no rates).
- TDS = **Phase-1 declared** (read from a `TDS`-coded `hr_variable_pay` row + YTD on payslip); full Sec-192 deferred.
- OT = **comp-off by default** (`payroll.ot_enabled=false`; paid-OT configurable).
- Finance = **approved batch → Finance authorizes → bank file after** (`hr_payroll_finance_handoff`); **zero GL writes** by Payroll (bank advice hard-guarded to handoff `authorized`).

## 3. Verification (against the test matrix)
- `tsc -b` ✅ · `vite build` ✅ (payroll lazy chunks) · `vitest` ✅ **20/20** (7 new engine unit tests: `PAY-CALC-01/02/03/04` percent/balancing/Σ=gross/rounding, `PAY-AT-02/06` LOP proration + basis, `PAY-ST-03` slab).
- **Engine correctness (unit):** deterministic; half-up rounding (8.33% → ₹83.30 exact, no float); balancing makes Σ earnings = gross; LOP proration; Σ(net-affecting lines) = net + round_off.
- **DB integration:** run→line→component chain inserts with valid `component_code` FK; audit triggers on all payroll tables; RLS confidential; cascade cleanup verified.
- **Backward compatibility:** frozen M1/M2/M3 untouched; reads-only from `hr_attendance_days` + M3; additive.
- **Note:** the full run pipeline (compute→approve→lock→handoff→bank-advice) is exercised in the app UI (auth-gated); the deterministic math it relies on is unit-proven, and the lifecycle guards are in code + validated by the matrix scenarios during UAT.

## 4. UAT Checklist (staging — sign in as hr/director)
- [ ] **Component master** — view seeded components; add one; toggle flags.
- [ ] **Salary structure** — create a structure with Basic/HRA/Special; assign to an employee (effective-dated); revise salary → history preserved.
- [ ] **Statutory config** — set PF/ESI/PT values effective-dated (placeholders → real); prior row auto-closed.
- [ ] **Run** — create a run for a period; compute; review the register + component/statutory breakdown per employee.
- [ ] **Validation** — a missing-salary employee blocks approval (exception panel).
- [ ] **SoD** — the run creator (hr) cannot approve; director approves; then lock.
- [ ] **Payslips** — publish; an employee sees only their own payslip (ESS); manager cannot see salary.
- [ ] **Finance** — locked run shows a pending handoff; director authorizes; **bank advice only generatable after authorization**; mark paid.
- [ ] **Configurability** — change `payroll.lop_basis`/`rounding`/`ot_enabled` in HR Settings; recompute reflects it.
- [ ] **Audit** — approvals/locks/handoff show in the Audit Log.

## 5. Release Notes — HRMS M4 (Payroll)
**Added:** Payroll — configurable component master + salary structures (effective-dated) + revisions, effective-dated statutory config, a deterministic paise-based calculation engine, run lifecycle (draft→computed→approved→locked→paid) with validation + SoD, payslips (ESS), Finance handoff (no auto-GL) + bank advice (post-authorization). All rules configurable; salary confidential.
**DB:** migration `093` (21 tables + RLS + audit + placeholder seeds).
**Compatibility:** additive; frozen M1/M2/M3 untouched; staging only; production untouched.
**Known/deferred (documented):** full Sec-192 TDS engine (Phase-1 declared now); automated statutory computation depends on Administration configuring `hr_statutory_config` (placeholders → 0); recoveries/reimbursement/arrear/encashment produce lines only when a carrying master component is configured (keeps the FK + Σ-reconcile invariant exact); `on_leave` treated as paid pending an M3 `is_paid` wiring refinement; payslip PDF via Document Management is a follow-up (figures shown from the locked run); scheduled payroll cron + full month-end register exports are Production-Readiness items.

## 6. Recommendation
**Staging-ready, not production-ready** — engine unit-proven, DB integration verified, backward-compatible, secure (confidential RLS + audit + SoD), Constitution-compliant. Awaits your authenticated UAT sign-off; statutory values must be configured in Administration before real runs; the deferred items are expected before production; go-live is gated behind the platform Production-Readiness phase.

## 7. Next
On approval + freeze of M4, the next milestone is **M5 — Recruitment & Employee Lifecycle** (per the frozen build order: Payroll → Recruitment/Lifecycle → Performance → Training → Assets → ESS → Dashboards → Regulatory), same milestone-gated process. No progression without explicit approval.
