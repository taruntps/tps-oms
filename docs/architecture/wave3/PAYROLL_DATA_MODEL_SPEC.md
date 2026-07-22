# Payroll (M4) — Data Model Specification

> **DESIGN ONLY — no code, SQL, or migrations.** Await user approval before implementing M4.
> Companion to `HRMS_M4_PAYROLL_CALCULATION_SPEC`. Builds on frozen M1/M2/M3 + Wave 2 Finance +
> Document Management. **Money = `bigint` paise.** All statutory rules effective-dated + versioned.
> **Expand-before-replace:** every table below is NEW/additive — no existing table is modified.

## Approved decisions honoured
1. Statutory = **placeholder seeds**, Administration-configured, **effective-dated + versioned** (`hr_statutory_config`).
2. TDS = **Phase-1 simplified** (declared monthly + manual adj + YTD + payslip); full Sec-192 deferred.
3. Overtime default = **Comp-Off**; paid-OT configurable, **off by default**.
4. Finance = Payroll emits an **approved batch**; Finance reviews/authorizes/executes; **bank file after Finance approval**. **No auto GL entries.**

## 1. Database architecture
- **Three layers:** **Masters** (configurable definitions), **Assignment** (effective-dated per-employee salary), **Transactions** (immutable-once-locked runs + artifacts).
- **Determinism & history:** salary structures, component values, and statutory config are **effective-dated**; a run snapshots the config effective for its period, so any historical run reproduces exactly.
- **Money:** `bigint` paise; display ÷100. **Security:** RLS — payroll/salary rows visible only to `hr/director/super_admin` (+ own payslip via ESS); managers never see pay. **Audit:** `fn_audit_wave2` on every table → append-only `audit_log`.
- **Reuse (not duplicated):** `profiles`/`employee_details`/`hr_grades` (M1), `hr_attendance_days` (M2), `hr_leave_*`/`hr_comp_off`/`hr_leave_encashments` (M3), `organizations`/`office_locations`, Finance `payments` (Wave 2), Document Management (payslip PDFs).

## 2. Entity-relationship model (overview)
```
hr_component_master ─┐
                     ├─< hr_salary_components >── hr_salary_structures ──(grade)── hr_grades[M1]
profiles[M1] ──< hr_employee_salary >── hr_salary_structures
profiles[M1] ──< hr_employee_salary_components (resolved per-employee values)
profiles[M1] ──< hr_salary_revisions (from_salary_id → to_salary_id)

hr_payroll_runs ──< hr_payroll_lines >── profiles[M1], hr_employee_salary
hr_payroll_lines ──< hr_payroll_component_lines >── hr_component_master
hr_payroll_lines ──< hr_payroll_statutory
hr_payroll_lines ──1:1─ hr_payslips ──(pdf)── Document Management

profiles ──< hr_variable_pay, hr_reimbursements, hr_arrears, hr_loans ──< hr_loan_schedule
hr_payroll_runs ──1:1─ hr_payroll_finance_handoff ──(batch)── Finance[Wave2]
hr_payroll_runs ──1:1─ hr_bank_advice ──< hr_bank_advice_lines
hr_statutory_config (effective-dated) ── read by the engine
```
Read-only inputs: `hr_attendance_days` (payable/LOP days), M3 leave/`is_paid` + `hr_leave_encashments` + `hr_comp_off`.

## 3. Master tables (configurable — Administration)
| Table | Purpose | Key columns |
|---|---|---|
| `hr_component_master` | Salary component catalogue | `code` uq, `name`, `type`(earning/deduction/employer_contribution/reimbursement), `calc_type`(fixed/percent_of_base/slab/formula/balancing), `base_code`, `depends_on`, flags `is_taxable/is_pf_wage/is_esi_wage/is_part_of_ctc/is_part_of_gross/prorate_on_lop`, `sort_order`, `is_active` |
| `hr_statutory_config` | Versioned statutory params (PF/ESI/PT/TDS/GRATUITY/BONUS/LWF) | `statute`, `param_key`, `value` jsonb (rate/ceiling/slabs), `effective_from`, `effective_to`, `note` — **placeholder-seeded**, effective-dated |
| `hr_payroll_settings` | Payroll rules (reuse `hr_policy_settings` `payroll.*`) | cycle, cutoff_day, lop_basis, rounding, ot_enabled(false), ot_rate_multiplier, encash_base/basis — configurable, no new table required |

## 4. Salary structures & assignment
| Table | Purpose | Key columns / relationships |
|---|---|---|
| `hr_salary_structures` | Named CTC template (per grade) | `code`, `name`, `grade_id → hr_grades`, `is_active` |
| `hr_salary_components` | Template lines | `structure_id → hr_salary_structures`, `component_code → hr_component_master`, `value_type`(amount/percent), `value` numeric, `sort_order` |
| `hr_employee_salary` | **Effective-dated** assignment per employee | `employee_id → profiles`, `structure_id`, `ctc` bigint, `effective_from`, `effective_to`(null=current), `status`(active/superseded), `created_by` |
| `hr_employee_salary_components` | Resolved per-employee component values (snapshot, allows overrides) | `employee_salary_id → hr_employee_salary`, `component_code`, `amount` bigint, `percent` numeric |

## 5. Salary revisions
| Table | Purpose | Key columns |
|---|---|---|
| `hr_salary_revisions` | Revision history (increment/promotion) | `employee_id → profiles`, `from_salary_id → hr_employee_salary`, `to_salary_id → hr_employee_salary`, `effective_date`, `reason`, `approved_by → profiles`, `source`(review/promotion/manual) |

Mechanism: a revision **supersedes** the prior `hr_employee_salary` (sets its `effective_to`, status=superseded) and inserts a new active row + a `hr_salary_revisions` link — **history preserved, nothing overwritten**. Historical runs read the row effective at their period.

## 6. Transaction tables — payroll runs
| Table | Purpose | Key columns |
|---|---|---|
| `hr_payroll_runs` | One run per period per org | `org_id → organizations`, `period_month`, `period_year`, `run_no`, `status`(draft/computed/approved/locked/paid), `lop_basis`, `computed_at`, `approved_by → profiles`, `approved_at`, `locked_at`, `notes`, `created_by`; **unique(org, period_month, period_year, version)** |
| `hr_payroll_lines` | Per-employee summary in a run | `run_id → hr_payroll_runs`, `employee_id → profiles`, `employee_salary_id → hr_employee_salary`, `payable_days`, `lop_days`, `gross`, `total_earnings`, `total_deductions`, `total_statutory`, `net_pay`, `round_off` (all bigint), `remarks`; **unique(run_id, employee_id)** |
| `hr_payroll_component_lines` | Component breakdown per line | `payroll_line_id → hr_payroll_lines`, `component_code → hr_component_master`, `component_type`, `amount` bigint, `is_statutory` |
| `hr_payroll_statutory` | Statutory breakdown per line | `payroll_line_id`, `statute`(PF/ESI/PT/TDS/GRATUITY/BONUS/LWF), `wage_base` bigint, `employee_share` bigint, `employer_share` bigint, `details` jsonb (rate/ceiling snapshot) |

## 7. Payslips
| Table | Purpose | Key columns |
|---|---|---|
| `hr_payslips` | Per-line payslip artifact | `payroll_line_id → hr_payroll_lines` (1:1), `employee_id`, `run_id`, `document_id` (PDF in Document Management — reuse, no dup storage), `published_at`, `ytd` jsonb (YTD earnings/TDS for §TDS Phase-1 display) |

## 8. Variable pay
| Table | Purpose | Key columns |
|---|---|---|
| `hr_variable_pay` | Incentive/bonus/paid-OT/one-off earnings for a period | `employee_id`, `period_month`, `period_year`, `component_code → hr_component_master`, `amount` bigint, `is_taxable`, `note`, `status`(pending/included/paid), `source_ref` (e.g. `hr_overtime.id` when OT-pay is enabled) |
| `hr_reimbursements` | Reimbursement claims → payroll or standalone | `employee_id`, `category`, `amount` bigint, `claim_ref`, `document_id`, `status`(submitted/approved/paid), `period_month/year` |

## 9. Arrears
| Table | Purpose | Key columns |
|---|---|---|
| `hr_arrears` | Retro amounts (revision/attendance correction after a locked run) | `employee_id`, `reason`, `amount` bigint (signed), `period_from`, `period_to`, `source_run_id → hr_payroll_runs`, `applied_run_id → hr_payroll_runs`, `status`(pending/applied) |

## 10. Recoveries
| Table | Purpose | Key columns |
|---|---|---|
| `hr_loans` | Loans / salary advances | `employee_id`, `type`(loan/advance), `principal` bigint, `balance` bigint, `emi` bigint, `start_date`, `status`(active/closed) |
| `hr_loan_schedule` | Amortization instalments | `loan_id → hr_loans`, `due_period_month/year`, `amount` bigint, `status`(pending/recovered/waived), `payroll_line_id → hr_payroll_lines` (set when recovered) |
| (LWP recovery) | computed in-run from `hr_attendance_days` — **no table** (derived) | — |

## 11. Payroll adjustments
| Table | Purpose | Key columns |
|---|---|---|
| `hr_payroll_adjustments` | Explicit retro adjustment after lock (audited) | `employee_id`, `original_run_id → hr_payroll_runs`, `adjustment_run_id → hr_payroll_runs`, `type`(credit/debit), `amount` bigint, `reason`, `created_by` |

Locked runs are never edited; an adjustment creates a **new linked run/arrear**, preserving the original (see §Versioning).

## 12. Bank advice (generated AFTER Finance approval — decision 4)
| Table | Purpose | Key columns |
|---|---|---|
| `hr_bank_advice` | Bank file for a run's net payouts | `run_id → hr_payroll_runs`, `status`(pending/finance_approved/generated/exported), `generated_at`, `generated_by`, `file_document_id` (in DMS), `finance_batch_ref` |
| `hr_bank_advice_lines` | Per-employee payout line | `advice_id → hr_bank_advice`, `employee_id`, `bank_ref` (from `hr_employee_bank`, M1), `amount` bigint, `status` |

The bank advice is **only generated once Finance has approved** the handoff (§13), matching "disbursement is human-executed".

## 13. Finance integration (no auto-GL — decision 4)
| Table | Purpose | Key columns |
|---|---|---|
| `hr_payroll_finance_handoff` | The **approved payroll batch** handed to Finance | `run_id → hr_payroll_runs` (1:1), `batch_ref`, `amount_total` bigint, `status`(pending/finance_review/authorized/paid/rejected), `finance_ref` (Wave-2 payment/journal ref, set by Finance), `authorized_by`, `authorized_at`, `notes` |

Flow: Payroll `locked` → creates `hr_payroll_finance_handoff` (status `pending`) → **Finance** reviews/authorizes (status `authorized`) → bank file generated (§12) → payment executed → status `paid`, `finance_ref` recorded. **Payroll never inserts Finance ledger/GL rows**; Finance owns disbursement + journals, respecting `accounting_periods` locks.

## 14. Audit model
- `fn_audit_wave2` trigger on **all** payroll tables → append-only `audit_log` (INSERT/UPDATE/DELETE).
- **Immutability:** `locked`/`paid` runs + their lines/statutory/payslips are read-only (status-guard + RLS). Salary-structure/config changes are effective-dated inserts, not updates.
- **Confidentiality:** RLS restricts salary/payroll to `hr/director/super_admin`; ESS sees only own payslip; cross-user reads audited. Segregation of duties: `hrms.payroll.process` ≠ `hrms.payroll.approve`.

## 15. Versioning strategy
- **Effective-dated config:** `hr_employee_salary`, `hr_salary_structures`/components, `hr_statutory_config` carry `effective_from/effective_to`; the engine snapshots what's effective for the run's period → historical reproducibility.
- **Run versioning:** `hr_payroll_runs.version` per (org, period); re-runs before approval supersede the draft; after lock, corrections are **adjustment runs / arrears** (§11) linked to the original, which stays immutable.
- **Payslip immutability:** published payslip PDFs are versioned artifacts in Document Management.

## 16. Table relationships (summary)
- **Masters → assignment:** `hr_component_master` → `hr_salary_components` → `hr_salary_structures` → `hr_employee_salary` (per `profiles`) → `hr_employee_salary_components`.
- **Run graph:** `hr_payroll_runs` → `hr_payroll_lines` → {`hr_payroll_component_lines`, `hr_payroll_statutory`, `hr_payslips`}.
- **Inputs:** `hr_variable_pay`, `hr_reimbursements`, `hr_arrears`, `hr_loans`/`hr_loan_schedule` → consumed by a run; read-only from `hr_attendance_days`(M2), M3 leave/comp-off/encashment.
- **Downstream:** `hr_payroll_runs` → `hr_payroll_finance_handoff` → Finance; `hr_payroll_runs` → `hr_bank_advice` → `hr_bank_advice_lines`.

## 17. Expand-before-replace compliance
- **Every table is NEW/additive.** No existing table (frozen M1/M2/M3, Wave 1/2) is altered.
- **Reuse, not duplicate:** identity from `profiles`/`employee_details`; bank from `hr_employee_bank`(M1); attendance from `hr_attendance_days`(M2); leave/encashment/comp-off from M3; PDFs from Document Management; disbursement/journals from Finance(Wave 2).
- **Effective-dated evolution:** future changes (e.g. new statutory param, full Sec-192 TDS) are additive columns/rows + new effective-dated config — never destructive.
- **No GL coupling:** Payroll↔Finance is a batch handoff (`hr_payroll_finance_handoff`), keeping modules decoupled and Finance the system of record for money movement.

## Proposed M4 deliverables (on approval)
Same 10-deliverable process: Database (these tables, additive) · Backend (calc engine RPCs, effective-dated config resolvers, Finance handoff, RLS) · Frontend (component master, salary structures/assignment, payroll run console, payslip viewer, ESS payslips, statutory registers, bank-advice-after-Finance) · Permissions (`hrms.payroll.*`, `hrms.salary.*`) · Validation · Unit tests (calc vs expected; effective-dating; rounding) · Integration tests (M2/M3 inputs → run; Finance handoff; no-GL guard) · Documentation · UAT checklist · Release notes.

**Stop condition:** data-model specification only — no code/SQL/migrations. Await review + approval before implementing M4.

