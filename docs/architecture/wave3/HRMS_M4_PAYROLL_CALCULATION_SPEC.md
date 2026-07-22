# HRMS M4 — Payroll Calculation Specification

> **Status:** ✅ APPROVED & FROZEN — M4 design baseline (2026-07-20), tag `v3.0-hrms-m4-design`.
> **DESIGN ONLY — no code, SQL, or migrations produced.** Await user approval before implementing M4.
> Builds on frozen M1 (Employee), M2 (Attendance), M3 (Leave). Design source: `HRMS_03_PAYROLL_STATUTORY`,
> `HRMS_BUSINESS_RULES_AND_POLICY` §9–§11. **Money = `bigint` paise** everywhere. **Finance disburses;
> HRMS never posts GL entries.** All rates/rules configurable + effective-dated (nothing hardcoded).

## 1. Payroll architecture
- **Inputs (read-only) from frozen modules:** salary structure (M4 own), attendance-derived present/LOP days (`hr_attendance_days`, M2), leave/LWP + encashment + comp-off (M3), loans/advances/reimbursements/arrears (M4 own).
- **Engine:** a deterministic, per-employee **payroll run** for a period → computes earnings → deductions → statutory → net. Pure function of (salary structure + period inputs + effective-dated config); re-running with identical inputs yields identical output.
- **Run lifecycle:** `draft → computed → approved → locked → paid` (§13–14). Approved/locked runs are **immutable**; corrections flow via **arrears** or **F&F**, never edits.
- **Output → Finance:** on lock, a payout instruction (net per employee) + an expense summary hand off to Finance (Wave 2 `payments` outflow + expense journal), respecting accounting-period locks. HRMS records the linkage; **Finance executes disbursement (human-confirmed)**.
- **Tables (spec, to design in M4):** `hr_component_master`, `hr_salary_structures`, `hr_salary_components`, `hr_employee_salary`, `hr_statutory_config`, `hr_payroll_runs`, `hr_payroll_lines`, `hr_payroll_component_lines`, `hr_payroll_statutory`, `hr_loans`, `hr_loan_schedule`, `hr_arrears`, `hr_reimbursements`, `hr_payslips`. All additive, audited, RLS (salary confidential to hr/director/super_admin).

## 2. Salary component model
- **Component master** (`hr_component_master`, configurable): `code`, `name`, `type` (earning | deduction | employer_contribution | reimbursement), `calc_type` (fixed | percent_of_base | slab | formula | balancing), `base` (which amount a % applies to — e.g. Basic, Gross), flags: `is_taxable`, `is_pf_wage`, `is_esi_wage`, `is_part_of_ctc`, `is_part_of_gross`, `prorate_on_lop` (bool), `sort_order`. **No component hardcoded** — new components added in Administration.
- **Salary structure** (`hr_salary_structures` + `hr_salary_components`): a named, grade-linked template = ordered set of components with values (amount in paise or percent). **Effective-dated** per employee via `hr_employee_salary` (revision history preserved).
- **Default seed (editable):** Basic (50% gross, PF/gratuity base), HRA (40% Basic), Conveyance, Special Allowance (**balancing**), + employer PF/ESI/gratuity provisions as CTC. (§10 lists the allowance catalogue from the directive — all are just component-master rows.)

## 3. Earnings and deductions
- **Earnings:** each earning component resolved by `calc_type` (fixed / % of base / balancing). Gross = Σ earnings (before deductions). Variable earnings (incentive, bonus, OT pay, arrears, reimbursements) added per-period as inputs.
- **Deductions:** statutory (PF, ESI, PT, TDS — §10), recoveries (loan/advance instalments, LWP), voluntary (as configured).
- **Net pay** = Gross earnings + variable earnings − employee deductions − statutory employee-share − recoveries. Employer contributions (PF/ESI/EDLI/gratuity) are **CTC/cost**, not deducted from net.

## 4. Attendance & Leave integration (read-model boundary)
- **Payable-days basis:** period calendar days (or fixed 30 — configurable `payroll.lop_basis`). Present-equivalent days = present + paid-leave + holidays + weekly-offs + OD/WFH (from `hr_attendance_days`, M2, and M3 leave).
- **Paid vs unpaid:** M3 `hr_leave_types.is_paid` + `hr_attendance_days.status` classify each day. `on_leave` on a **paid** type = paid; `LWP`/`absent` = unpaid (LOP).
- **Payroll NEVER writes** attendance/leave — it only reads the evaluated `hr_attendance_days` + M3 leave ledger. (Attendance/Leave remain the systems of record; Payroll is downstream.)
- **Cut-off:** attendance frozen at `payroll.cutoff_day` (default 25th) for the run; post-cutoff changes flow as **arrears** next period.

## 5. LOP (Loss of Pay) calculation
- **LOP days** = unpaid-absent + LWP + (½ per configured late-rule / half-day) for the period, from `hr_attendance_days`.
- **Per-day rate** = (sum of components where `prorate_on_lop = true`) ÷ `lop_basis_days` (`payroll.lop_basis`: calendar days of the month, or fixed 30 — configurable).
- **LOP amount (paise)** = round( per-day-rate × LOP-days ), deducted from the prorated earnings. Only components flagged `prorate_on_lop` are reduced (e.g. Basic/HRA/allowances); fixed reimbursements are not.
- **Configurable:** `payroll.lop_basis`, whether weekly-offs/holidays inside an LOP stretch are also unpaid (**sandwich** interplay with M3 `leave.sandwich`).

## 6. Overtime handling
- **Source:** approved `hr_overtime` (M2) rows in the period with `compensation = 'paid'` (comp-off ones go to §7, not pay).
- **OT rate:** configurable `payroll.ot_rate_multiplier` (default 1×; e.g. 2× statutory for factory schedules) × per-hour base (`ot_base` component set, default Basic ÷ (payable-days × standard-hours)).
- **OT amount (paise)** = round( OT-minutes ÷ 60 × OT-hourly-rate × multiplier ), added as a variable earning. Only **approved** OT is paid; unapproved is ignored.

## 7. Comp-off interaction
- Comp-off is **time-off, not cash** — it does **not** enter payroll as pay. Approved OT/holiday-work with `compensation='comp_off'` credits the M3 `hr_comp_off` ledger; using comp-off is a paid day in attendance/leave. Payroll only sees the *resulting* paid/unpaid day. **No payroll line for comp-off.** (If a policy later allows comp-off encashment, it routes through §8.)

## 8. Leave encashment rules
- **Trigger:** M3 `hr_leave_encashments` (status `approved`) for encashable types (`hr_leave_types.is_encashable`, e.g. EL) — annual window or at F&F (§9).
- **Amount (paise)** = round( encashable-days × per-day-encashment-rate ), where the rate base is configurable (`payroll.encash_base`, default Basic + DA) ÷ `payroll.encash_basis_days` (default 30).
- Payroll **computes** the amount, writes it back to `hr_leave_encashments.amount` (M3 left it null), adds it as a (taxable per config) earning, and posts the leave ledger `encashment` debit (M3). Encashment is taxable per statutory config.

## 9. Full & Final settlement (F&F)
- **Trigger:** M1 lifecycle separation (`hr_separations`) reaching F&F, after asset clearance.
- **Components:** last-period salary (prorated to last working day) + **leave encashment** (§8, EL balance) + **gratuity** (§10, if eligible) + pending reimbursements/arrears − **recoverables** (outstanding loans/advances, notice-shortfall, asset damage).
- **Output:** a single F&F statement; net payable/recoverable → Finance payout (or recovery). Writes `hr_fnf_settlements` (M1) + a final payslip; locks the employee out of future runs.
- **Gratuity at F&F** = last-drawn (Basic+DA) × 15/26 × completed-years (if tenure ≥ 5y) — configurable formula (§10).

## 10. Statutory calculations (all configurable, versioned + effective-dated — `hr_statutory_config` / `hr_policy_settings.statutory.*`)
- **PF:** employee 12% of PF-wage (Σ components `is_pf_wage`, capped at configurable ceiling ₹15,000); employer 12% split EPS 8.33% (capped) + EPF; EDLI + admin charges (employer/CTC). UAN carried from M1.
- **ESI:** if gross ≤ eligibility ceiling (₹21,000, configurable) → employee 0.75% + employer 3.25% of ESI-wage; **contribution-period stickiness** (Apr–Sep / Oct–Mar) — eligibility fixed for the period even if gross crosses mid-period.
- **Professional Tax (Punjab):** slab lookup (`hr_statutory_config` PT slabs) — default ₹200/month above the exemption threshold.
- **TDS (Sec 192):** YTD projected annual tax (old/new regime per employee declaration) − TDS already deducted → this month's TDS = remaining ÷ remaining-months; true-up in the last months; Form 16 / 24Q at year end. Declarations + regime are employee inputs.
- **Gratuity:** accrued provision each period (employer/CTC); paid at F&F per §9.
- **Bonus / LWF:** Payment-of-Bonus (8.33–20%, eligibility ceiling) and Punjab LWF — configurable, periodic.
- **Registers/returns:** PF ECR, ESI return, PT challan, TDS 24Q/Form 16, gratuity/bonus registers — generated from the run.

## 11. Formula precedence (deterministic evaluation order)
The engine evaluates in a fixed, dependency-safe order so results are reproducible:
1. Resolve **payable/LOP days** (from M2/M3, §4–5).
2. Resolve **fixed** earning components, then **percent_of_base** (base already computed), then **balancing** (Special Allowance = Gross target − Σ others).
3. Apply **LOP proration** to `prorate_on_lop` components (§5).
4. Add **variable earnings** (OT §6, arrears, incentive/bonus, reimbursements, encashment §8).
5. Compute **statutory wages** (PF-wage, ESI-wage) from flagged components, then **statutory deductions** (§10) in order PF → ESI → PT → TDS (TDS last, as it depends on taxable total).
6. Apply **recoveries** (loan/advance schedule, LWP already in step 3).
7. **Net** = earnings − employee deductions − statutory-employee − recoveries; employer contributions computed for CTC/cost.
- Component `sort_order` + an explicit `depends_on` guard prevent cycles; balancing components run after all their inputs. Precedence is **config-driven**, not hardcoded per component.

## 12. Rounding rules
- **Internal math in paise (bigint)** — no floating-point drift. Percentages computed on paise, rounded **half-up** to the paise at each component.
- **Statutory rounding** per statute (e.g. PF/ESI rounded to the nearest rupee per rule; PT fixed slab; TDS to the rupee).
- **Net pay** rounded to the nearest ₹1 (`payroll.rounding`, configurable) with the rounding delta carried to a `round_off` line so Σ components = net exactly.
- Display divides by 100 (`formatRupees`); storage stays paise.

## 13. Payroll approval workflow
- **States:** `draft` (created, inputs gathered) → `computed` (engine run, reviewable register) → `approved` (authorized) → `locked` (immutable) → `paid` (Finance disbursed).
- **Roles:** `hrms.payroll.process` (hr/super_admin) creates + computes; `hrms.payroll.approve` (director/super_admin) approves; **segregation of duties** — processor ≠ approver. Payslips publish on lock; disbursement is Finance + human-confirmed.
- Every transition is audit-logged; a rejected run returns to `draft` for correction.

## 14. Payroll locking & versioning
- **Lock:** on `locked`, all `hr_payroll_lines` + statutory + payslips become **read-only** (enforced by RLS/trigger + status guard). No edits — corrections only via **arrears** (next run) or **F&F**.
- **Versioning:** a run is versioned per (period, org); a re-run before approval supersedes the prior draft. After lock, an **adjustment run** (linked to the original) handles retro changes; the original stays immutable. Salary-structure changes are **effective-dated** (`hr_employee_salary` history), so historical runs reproduce exactly from the config effective at that period.

## 15. Audit & compliance strategy
- **Immutable audit:** every run/line/statutory/salary-change → append-only `audit_log` (existing `fn_audit_wave2`).
- **Confidentiality:** salary/payroll visible only to hr/director/super_admin (RLS); managers never see pay; cross-user reads logged.
- **Statutory compliance:** rates versioned + effective-dated (amendments = config, no code); registers/returns exportable; retention per policy (payroll/PF/ESI ≥ 7y).
- **Reconciliation:** run totals reconcile to the Finance payout + expense journal (Wave 2), respecting `accounting_periods` locks; HRMS never posts GL directly.

---

## Proposed M4 milestone deliverables (on spec approval)
Same process as M1–M3: **Database** (the §1 tables, additive) · **Backend** (calculation engine RPCs, statutory config, Finance handoff, RLS) · **Frontend** (salary structures, payroll run console, payslip viewer, ESS payslips, statutory registers) · **Permissions** (`hrms.payroll.*`, `hrms.salary.*`) · **Validation** · **Unit tests** (calc vs expected, statutory edge cases) · **Integration tests** (M2/M3 inputs → run; Finance handoff) · **Documentation** · **UAT checklist** · **Release notes**.

## Approved decisions (2026-07-20)
1. **Statutory values:** seed **placeholders only**; Administration configures actual values; all statutory rules **effective-dated + versioned**.
2. **TDS:** implement **Phase 1 simplified** — monthly **declared** TDS + manual adjustment + **YTD tracking** + payslip display. Full Section-192 engine deferred to a later enhancement.
3. **Overtime:** default policy = **Comp-Off**; paid OT remains configurable but **disabled by default**.
4. **Finance integration:** Payroll does **NOT** auto-create Finance accounting entries. Payroll produces an **approved payroll batch** → Finance reviews/authorizes/executes payment → **bank file generated after Finance approval**.

**Stop condition:** specification only — no code/SQL/migrations. Await review + approval before implementing M4.

