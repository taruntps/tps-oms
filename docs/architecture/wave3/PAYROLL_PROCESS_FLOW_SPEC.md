# Payroll (M4) — Process Flow Specification

> **Status:** ✅ APPROVED & FROZEN — part of the M4 design baseline (2026-07-20, tag `v3.0-hrms-m4-design`,
> alongside `HRMS_M4_PAYROLL_CALCULATION_SPEC` + `PAYROLL_DATA_MODEL_SPEC`).
> **DESIGN ONLY — no code, SQL, or migrations.**
> Operational lifecycle for the frozen M4 design baseline (`HRMS_M4_PAYROLL_CALCULATION_SPEC` +
> `PAYROLL_DATA_MODEL_SPEC`, tag `v3.0-hrms-m4-design`). Reads frozen M2/M3; **Finance disburses,
> Payroll never posts GL.** Every step configurable (`hr_policy_settings.payroll.*`) — nothing hardcoded.

## End-to-end at a glance
```
Calendar/cutoff → FREEZE (attendance, leave, variable pay) → CREATE run(draft)
  → COMPUTE(engine) → VALIDATE(checkpoints) → [exceptions?] → APPROVE → LOCK
  → PAYSLIPS → FINANCE HANDOFF(batch) → Finance authorizes → BANK ADVICE → PAYMENT confirm(paid)
  → MONTH-END CLOSE.   Retro after lock → ADJUSTMENT RUN / arrears.   All steps → AUDIT.
```

## 1. Payroll calendar
- **Cycle:** monthly (configurable `payroll.cycle`); pay period = 1st–last of month (`payroll.period`).
- **Calendar per period (configurable dates):** attendance cut-off day (default 25th), leave/variable-pay freeze (with cut-off), process window (cut-off→pay-2), approval by (pay-1), pay date (last working day or 1st next month, `payroll.pay_date`).
- Driven by config + the holiday calendar (M3) for working-day resolution; the calendar is data, not code.

## 2. Payroll cutoff rules
- At `payroll.cutoff_day` the period's **inputs freeze** for the run: attendance-derived days, approved leave, approved variable pay, loan schedule due this period.
- Post-cutoff changes do **not** alter the current run — they flow as **arrears/adjustments** into the next run (§15). Cutoff is per-run and recorded on `hr_payroll_runs`.

## 3. Attendance freeze
- The run **snapshots** `hr_attendance_days` (M2) for the period up to cut-off → per-employee present/LOP/OD/WFH/half-day counts stored on `hr_payroll_lines` (payable_days, lop_days). Source `hr_attendance_days` is **read-only** to Payroll.
- After freeze, an attendance correction (M2) affecting a locked run becomes an **arrear** next period (not a re-open).

## 4. Leave freeze
- Approved leave (M3) within the period is snapshotted: paid-leave days count as payable; LWP/unpaid count as LOP. **Comp-off** used = paid day (no cash). **Encashment** approved in the window is computed (§Calc §8) and included; the M3 encashment row's `amount` is written back and the leave ledger `encashment` debit posts.
- Pending leave at cut-off is **excluded** (treated per attendance status); once approved later → arrear if it changes a locked period.

## 5. Variable pay freeze
- `hr_variable_pay` (incentive/bonus/paid-OT when enabled), `hr_reimbursements` (approved), and `hr_arrears` (pending, targeted at this period) with status ready-for-payroll are **locked into the run** at cut-off.
- **OT default = comp-off** (decision 3): paid-OT rows only exist when `payroll.ot_enabled=true`; otherwise OT is comp-off (M3) and never enters variable pay.
- Items approved after cut-off roll to the next run.

## 6. Payroll processing sequence (the run)
Per employee, deterministically (Calc-Spec §11 precedence):
1. **Resolve config** effective for the period (salary structure/components, statutory config — effective-dated snapshot).
2. **Resolve days** (attendance/leave freeze → payable, LOP).
3. **Earnings:** fixed → percent-of-base → balancing; apply **LOP proration** to flagged components.
4. **Variable earnings:** OT (if enabled), arrears, incentive/bonus, reimbursements, encashment.
5. **Statutory wages** (PF-wage, ESI-wage) → **deductions** PF → ESI → PT → **TDS (Phase-1 declared + YTD)**.
6. **Recoveries:** loan/advance instalment (from schedule), LWP (already prorated).
7. **Net** = earnings − employee deductions − statutory-employee − recoveries; compute employer contributions (CTC). **Round** (Calc-Spec §12) with a `round_off` line.
8. **Persist** `hr_payroll_lines` + `hr_payroll_component_lines` + `hr_payroll_statutory`; set run `status=computed`. Re-running before approval **supersedes** the prior computed set (same version) — idempotent for identical inputs.

## 7. Validation checkpoints
Before a run can move `computed → approved`, automated checks must pass (blocking = error, non-blocking = warning surfaced for HR review):
- **Config completeness (blocking):** every employee in scope has an active `hr_employee_salary` effective for the period; every referenced component + statutory param has an effective config row.
- **Coverage (warning):** all active employees present; none with missing attendance snapshot.
- **Sanity (blocking):** `net_pay ≥ 0`; `Σ component_lines = net + round_off`; statutory wage bases within configured ceilings; no negative gross.
- **Statutory (warning):** ESI eligibility consistent with the sticky contribution period; PT slab resolved; TDS declared present (Phase-1) else 0 with flag.
- **Duplicates (blocking):** no second run in `computed/approved/locked` for the same (org, period) version.
- Results recorded against the run; a failing blocking check keeps the run in `computed` (cannot approve).

## 8. Exception handling
- **Per-line exceptions** (missing salary, missing bank, negative net, missing TDS declaration) are listed on the run's exception panel; HR resolves (assign salary, add bank, post declaration) and **recomputes** — no partial approvals.
- **Employee hold:** an employee can be excluded from a run (e.g. under investigation) → carried to next run; recorded with reason + audit.
- **Mid-period joiner/leaver:** prorated by effective-dated salary + attendance days; leaver's final period routes to **F&F** (Calc-Spec §9), not the regular run.

## 9. Approval workflow
- **Segregation of duties:** `hrms.payroll.process` (HR) creates/computes/validates; `hrms.payroll.approve` (Director/super_admin) approves. Processor ≠ approver (enforced).
- Approver reviews the register + exceptions; **Approve** → `status=approved`, `approved_by/at` set. **Reject** → back to `draft` with a note for correction. Every transition audited + optionally notified.

## 10. Payroll locking
- On approval → **Lock**: `status=locked`, `locked_at` set. All `hr_payroll_lines` / component lines / statutory / (subsequent) payslips become **read-only** (status-guard + RLS). No edits thereafter — corrections only via **adjustment runs / arrears** (§15).
- Locking is the point of no return for the period's figures; it gates payslip publication + Finance handoff.

## 11. Payslip generation
- On lock, generate a **payslip per `hr_payroll_line`**: render PDF → store in **Document Management** (`hr_payslips.document_id`), compute + store **YTD** (earnings, TDS — Phase-1 display), `published_at`.
- Employees view/download **their own** payslip via ESS (`hrms.payroll.view` self / payslip.self). Payslips are immutable versioned artifacts.

## 12. Finance handoff (approved batch — no auto-GL)
- On lock, create **`hr_payroll_finance_handoff`** (status `pending`): `batch_ref`, `amount_total` (Σ net), link to the run. This is the **approved payroll batch** presented to Finance.
- **Finance** (Wave 2) reviews the batch → **authorizes** (status `authorized`, `authorized_by/at`) or **rejects** (back to HR with reason). Payroll writes **no** Finance ledger/GL rows; Finance owns the payment + journal, respecting `accounting_periods` locks.

## 13. Bank advice generation (after Finance approval — decision 4)
- **Only after** the handoff is `authorized`, generate **`hr_bank_advice`** + `hr_bank_advice_lines` (employee, bank ref from `hr_employee_bank` M1, net amount). Produce the bank file (NEFT format, configurable) → store in DMS (`file_document_id`), status `generated` → `exported` when downloaded.
- Generating before Finance authorization is blocked (status guard). This enforces "disbursement is human-executed".

## 14. Payment confirmation
- After the bank executes payment, Finance/HR marks the handoff **`paid`** (+ `finance_ref`) and the run `status=paid`. Bank-advice lines flip to `paid`. Loan-schedule instalments recovered in the run are marked `recovered` (linked to the payroll line).
- Failed/returned payments are handled per-line (re-issue) and audited; a returned line does not re-open the locked run (correction via adjustment if the amount changes).

## 15. Adjustment runs
- Retro changes after lock (late attendance correction, back-dated revision, missed input) → an **adjustment run** (`hr_payroll_runs` linked to the original) or an **arrear** (`hr_arrears`) applied in the next regular run. Recorded in `hr_payroll_adjustments` (credit/debit, reason, links). The **original run stays immutable**; net effect flows through the next Finance handoff.
- Adjustment runs follow the same compute→validate→approve→lock→handoff cycle.

## 16. Month-end close
- After payment confirmation, **close the period**: mark the run `paid`, generate statutory registers (PF ECR, ESI, PT, TDS 24Q inputs — from `hr_payroll_statutory`), reconcile Σ net to the Finance batch, and (Finance side) ensure the `accounting_period` for the month is closed. A closed period blocks new regular runs for that month (only adjustment runs, which target the next open period).
- Close is a checklist state, audited; statutory filing deadlines surface via the compliance calendar (reuse Notifications).

## 17. Error recovery
- **Compute failure** (bad config/data): run stays `draft/computed`; exceptions listed; fix inputs → recompute. No partial persistence — compute is transactional per run.
- **Wrong figures found before approval:** recompute (supersedes). **After lock:** adjustment run/arrear (§15) — never edit locked data.
- **Handoff rejected by Finance:** returns to HR; correct via recompute (if not yet locked) or adjustment (if locked) → re-handoff.
- **Bank return:** per-line re-issue + audit; escalate via Notifications.
- **Idempotency:** recompute is deterministic; re-running never double-posts (supersede semantics + unique(run, employee)).

## 18. Audit checkpoints
Immutable `audit_log` entries (via `fn_audit_wave2`) at: run create, compute, each validation result, exception resolution, approve, reject, lock, payslip publish, Finance handoff create/authorize/reject, bank advice generate/export, payment confirm/paid, adjustment create, month-end close. Plus: salary/structure/statutory-config changes (effective-dated inserts). Confidentiality + segregation-of-duties enforced throughout (RLS: pay visible only to hr/director/super_admin; processor ≠ approver).

---

## Post-approval — M4 implementation deliverables
Same 10-deliverable milestone process: **Database** (the data-model tables, additive) · **Backend** (deterministic calc engine + effective-dated resolvers + validation + Finance handoff + RLS + status guards) · **Frontend** (component master, salary structures/assignment/revision, payroll run console with the §6–§16 flow + exception panel, payslip viewer + ESS, statutory registers, bank-advice-after-Finance) · **Permissions** (`hrms.payroll.*`, `hrms.salary.*`) · **Validation** · **Unit tests** (calc vs expected; rounding; effective-dating; validation rules) · **Integration tests** (M2/M3 freeze → run; Finance handoff; no-GL guard; adjustment run) · **Documentation** (as-built) · **UAT checklist** · **Release notes**. Present the completed M4 for review before any subsequent module.

**Stop condition:** process specification only — no code/SQL/migrations. Await review + approval before implementing M4.

