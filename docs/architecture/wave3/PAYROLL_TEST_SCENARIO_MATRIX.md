# Payroll (M4) — Test Scenario Matrix

> Comprehensive UAT + integration + unit scenarios for M4, derived from the frozen M4 design
> baseline (calc spec, data-model spec, process-flow spec). **Priority:** P1 critical · P2 important · P3 edge.
> **Test Type:** U unit · I integration · UAT acceptance. Modules: M1 Employee, M2 Attendance,
> M3 Leave, M4 Payroll, FIN Finance, SEC security. Each run in `staging`; money = paise.

## 1. Employee lifecycle
| ID | Description | Preconditions | Steps | Expected | Modules | Pri | Type |
|---|---|---|---|---|---|---|---|
| PAY-EL-01 | Mid-month joiner prorated | Employee joins on the 15th; salary structure assigned effective that date | Run payroll for the month | Earnings prorated to joining→month-end payable days; LOP=0 for pre-joining | M1,M2,M4 | P1 | I |
| PAY-EL-02 | Mid-month leaver → F&F, not regular run | Separation with last-working-day mid-month | Run payroll | Leaver excluded from regular run; routed to F&F (encashment+gratuity−recoveries) | M1,M3,M4 | P1 | I |
| PAY-EL-03 | Salary revision effective mid-period | Revision effective 16th supersedes prior salary | Run payroll | Days 1–15 at old rate, 16–EOM at new (or per policy); revision history preserved | M1,M4 | P1 | I |
| PAY-EL-04 | Employee with no active salary | Employee lacks effective `hr_employee_salary` | Compute run | Blocking validation error; employee flagged; run cannot approve | M1,M4 | P1 | I |
| PAY-EL-05 | Confirmed vs probation employee | Both statuses present | Run payroll | Both processed identically unless a policy differentiates (configurable) | M1,M4 | P3 | UAT |

## 2. Attendance variations
| ID | Description | Preconditions | Steps | Expected | Modules | Pri | Type |
|---|---|---|---|---|---|---|---|
| PAY-AT-01 | Full attendance, no LOP | All present days | Run payroll | Full gross, LOP=0 | M2,M4 | P1 | I |
| PAY-AT-02 | Unpaid absence → LOP | 2 unpaid-absent days | Run payroll | LOP=2×per-day-rate on prorate components only; net reduced | M2,M4 | P1 | I |
| PAY-AT-03 | Half-day → 0.5 LOP | 1 half-day (per late-rule/half-day policy) | Run payroll | 0.5 LOP applied | M2,M4 | P2 | I |
| PAY-AT-04 | OD/WFH counts as present | Approved OD + WFH days | Run payroll | No LOP for OD/WFH | M2,M4 | P2 | I |
| PAY-AT-05 | Attendance correction after cutoff | Locked run; correction to a prior day | Correct in M2 next period | No change to locked run; arrear generated next run | M2,M4 | P1 | I |
| PAY-AT-06 | LOP basis config (calendar vs 30) | Toggle `payroll.lop_basis` | Run with each basis | Per-day rate differs per basis; matches config | M4 | P2 | U |

## 3. Leave scenarios
| ID | Description | Preconditions | Steps | Expected | Modules | Pri | Type |
|---|---|---|---|---|---|---|---|
| PAY-LV-01 | Paid leave = no LOP | Approved CL/EL in period | Run payroll | Paid-leave days payable; no LOP | M3,M4 | P1 | I |
| PAY-LV-02 | LWP = LOP | Approved LWP days | Run payroll | LWP days treated as LOP (unpaid) | M3,M4 | P1 | I |
| PAY-LV-03 | Leave approved → attendance on-leave (trigger) | Apply+approve leave | Check attendance + run | `hr_attendance_days` stamped on-leave (M3 trigger 092); payroll reads paid | M2,M3 | P1 | I |
| PAY-LV-04 | Leave encashment computed | Approved EL encashment (amount null) | Run payroll | Amount computed (days×base÷basis), written back; ledger encashment debit; taxable | M3,M4 | P1 | I |
| PAY-LV-05 | Comp-off used = paid day, no cash | Comp-off available + used | Run payroll | No payroll line for comp-off; day paid | M2,M3,M4 | P2 | I |
| PAY-LV-06 | Pending leave at cutoff excluded | Leave still pending at cutoff | Run payroll | Treated per attendance status; if later approved → arrear | M3,M4 | P2 | I |

## 4. Payroll calculations
| ID | Description | Preconditions | Steps | Expected | Modules | Pri | Type |
|---|---|---|---|---|---|---|---|
| PAY-CALC-01 | Basic/HRA/balancing resolution | Structure: Basic 50%, HRA 40% Basic, Special=balancing | Compute | Components resolve in precedence; Special balances to gross target | M4 | P1 | U |
| PAY-CALC-02 | Percent-of-base correctness | HRA = 40% of Basic | Compute | HRA = round(0.40×Basic) in paise | M4 | P1 | U |
| PAY-CALC-03 | Σ components = net + round_off | Any run | Compute | Component lines sum exactly to net + round_off | M4 | P1 | U |
| PAY-CALC-04 | Rounding half-up + net to ₹1 | Amounts with paise remainder | Compute | Per-component half-up; net rounded to ₹1; round_off line carries delta | M4 | P1 | U |
| PAY-CALC-05 | Deterministic re-run | Same inputs, recompute | Compute twice | Identical output; supersede, no double-post | M4 | P1 | I |
| PAY-CALC-06 | Effective-dated config reproduces history | Run a past period after a later revision | Recompute past period | Uses config effective at that period; unchanged figures | M4 | P1 | I |
| PAY-CALC-07 | Negative net blocked | Recoveries exceed earnings | Compute | Validation blocks (net<0); flagged for HR | M4 | P2 | I |

## 5. Variable pay
| ID | Description | Preconditions | Steps | Expected | Modules | Pri | Type |
|---|---|---|---|---|---|---|---|
| PAY-VP-01 | Incentive/bonus added | `hr_variable_pay` incentive for period | Run payroll | Added as (taxable per config) earning; in gross | M4 | P1 | I |
| PAY-VP-02 | Reimbursement (non-taxable) | Approved reimbursement | Run payroll | Added, not prorated on LOP, taxable per config | M4 | P2 | I |
| PAY-VP-03 | Paid OT off by default (comp-off) | `payroll.ot_enabled=false`; approved OT comp_off | Run payroll | No OT pay line; comp-off credited (M3); day paid | M2,M3,M4 | P1 | I |
| PAY-VP-04 | Paid OT when enabled | Toggle `ot_enabled=true`; approved paid OT | Run payroll | OT pay = minutes/60×rate×multiplier added | M2,M4 | P2 | I |
| PAY-VP-05 | Variable pay after cutoff rolls over | Item approved after cutoff | Run payroll | Excluded this run; included next | M4 | P2 | I |

## 6. Loans and recoveries
| ID | Description | Preconditions | Steps | Expected | Modules | Pri | Type |
|---|---|---|---|---|---|---|---|
| PAY-LN-01 | Loan EMI recovered | Active loan with due instalment | Run payroll | EMI deducted; schedule row → recovered + linked to line; balance reduced | M4 | P1 | I |
| PAY-LN-02 | Advance recovery | Salary advance with schedule | Run payroll | Recovered per schedule | M4 | P2 | I |
| PAY-LN-03 | Recovery capped to net | EMI would push net<0 | Run payroll | Recovery capped/deferred per policy; net≥0; remainder carried | M4 | P2 | I |
| PAY-LN-04 | Loan closes on final EMI | Last instalment | Run payroll | Balance=0; loan status=closed | M4 | P3 | I |

## 7. Statutory deductions (placeholder config, effective-dated)
| ID | Description | Preconditions | Steps | Expected | Modules | Pri | Type |
|---|---|---|---|---|---|---|---|
| PAY-ST-01 | PF employee + employer split | PF config (rate/ceiling) effective | Compute | Employee 12% PF-wage (capped); employer split EPS/EPF per config | M4 | P1 | U |
| PAY-ST-02 | ESI eligibility + stickiness | Gross near ceiling; contribution period | Compute across months | ESI applied per eligibility; sticky within Apr–Sep/Oct–Mar | M4 | P1 | I |
| PAY-ST-03 | PT slab (Punjab) | PT slab config | Compute | PT per slab (₹200 placeholder) | M4 | P2 | U |
| PAY-ST-04 | TDS Phase-1 declared + YTD | Declared monthly TDS + manual adj | Run 3 months | Declared TDS deducted; YTD accumulates; payslip shows YTD | M4 | P1 | I |
| PAY-ST-05 | Statutory config effective-dating | Change PF rate effective next month | Run old + new month | Old month uses old rate; new month new rate; both reproducible | M4 | P1 | I |
| PAY-ST-06 | Employer contributions in CTC not net | Any run | Compute | Employer PF/ESI/gratuity in CTC/cost, not deducted from net | M4 | P2 | U |
| PAY-ST-07 | Registers generated | Locked run | Generate | PF ECR/ESI/PT/24Q inputs produced from `hr_payroll_statutory` | M4 | P2 | UAT |

## 8. Finance workflow (no auto-GL)
| ID | Description | Preconditions | Steps | Expected | Modules | Pri | Type |
|---|---|---|---|---|---|---|---|
| PAY-FIN-01 | Handoff batch on lock | Run locked | Lock run | `hr_payroll_finance_handoff` created (pending), Σ net; no GL rows written | M4,FIN | P1 | I |
| PAY-FIN-02 | Finance authorizes | Handoff pending | Finance authorizes | Status→authorized; recorded finance_ref | M4,FIN | P1 | I |
| PAY-FIN-03 | Bank advice only after Finance auth | Handoff pending (not yet authorized) | Attempt bank advice | Blocked; allowed only after authorized | M4,FIN | P1 | I |
| PAY-FIN-04 | Payment confirmation | Bank advice generated | Finance marks paid | Handoff+run→paid; advice lines paid; loans recovered | M4,FIN | P1 | I |
| PAY-FIN-05 | Finance rejects handoff | Handoff pending | Finance rejects | Back to HR with reason; correct/adjust → re-handoff | M4,FIN | P2 | I |
| PAY-FIN-06 | No GL coupling | Any handoff | Inspect | Payroll writes zero Finance ledger/GL rows (guard) | M4,FIN | P1 | I |

## 9. Security and permissions
| ID | Description | Preconditions | Steps | Expected | Modules | Pri | Type |
|---|---|---|---|---|---|---|---|
| PAY-SEC-01 | Manager cannot see salary/payroll | Manager login | Open payroll/salary | Access denied (RLS + UI gate); no salary data | SEC,M4 | P1 | I |
| PAY-SEC-02 | ESS sees only own payslip | Employee login | Open payslips | Only own payslip; cannot list others | SEC,M4 | P1 | I |
| PAY-SEC-03 | Segregation of duties | HR processes run | HR tries to approve | Blocked (needs `payroll.approve` = director) | SEC,M4 | P1 | I |
| PAY-SEC-04 | Cross-user salary read audited | HR views employee salary | Inspect audit | Access/change logged in `audit_log` | SEC,M4 | P2 | I |
| PAY-SEC-05 | Locked run immutable | Locked run | Attempt edit line | Rejected (status guard/RLS) | SEC,M4 | P1 | I |

## 10. Error handling
| ID | Description | Preconditions | Steps | Expected | Modules | Pri | Type |
|---|---|---|---|---|---|---|---|
| PAY-ERR-01 | Missing bank details | Employee lacks `hr_employee_bank` | Generate bank advice | Line flagged; advice highlights; HR resolves | M1,M4 | P1 | I |
| PAY-ERR-02 | Missing TDS declaration | No declared TDS | Compute | TDS=0 with warning flag (Phase-1) | M4 | P2 | I |
| PAY-ERR-03 | Duplicate run blocked | Existing computed run for period | Create second | Blocked (unique org+period+version) | M4 | P1 | I |
| PAY-ERR-04 | Compute failure transactional | Bad config mid-run | Compute | No partial persistence; run stays computable after fix | M4 | P1 | I |
| PAY-ERR-05 | Bank return re-issue | A payment returns | Mark returned | Per-line re-issue; run stays locked; audited | M4,FIN | P2 | UAT |

## 11. Retro adjustments
| ID | Description | Preconditions | Steps | Expected | Modules | Pri | Type |
|---|---|---|---|---|---|---|---|
| PAY-ADJ-01 | Back-dated revision → arrear | Revision effective in a locked period | Next run | Arrear computed + applied next run; original immutable | M1,M4 | P1 | I |
| PAY-ADJ-02 | Adjustment run linked | Locked run needs correction | Create adjustment run | Linked to original; own approve→lock→handoff cycle | M4,FIN | P1 | I |
| PAY-ADJ-03 | Adjustment audited | Any adjustment | Inspect | `hr_payroll_adjustments` + audit_log entries | M4 | P2 | I |

## 12. Month-end close
| ID | Description | Preconditions | Steps | Expected | Modules | Pri | Type |
|---|---|---|---|---|---|---|---|
| PAY-MEC-01 | Close after payment | Run paid | Close period | Run→paid/closed; registers generated; reconcile Σ net to Finance batch | M4,FIN | P1 | UAT |
| PAY-MEC-02 | Closed period blocks new regular run | Period closed | Create regular run same month | Blocked; only adjustment run (next open period) | M4 | P2 | I |
| PAY-MEC-03 | Reconciliation to Finance | Run paid | Reconcile | Σ payroll net = Finance batch total; discrepancy flagged | M4,FIN | P1 | I |

## Summary
~58 scenarios across 12 categories. **P1 (critical)** cover the core lifecycle, calculation correctness, statutory, Finance no-GL, security/SoD, and immutability — all must pass for UAT sign-off. **Unit** tests assert calculation/rounding/effective-dating in isolation; **Integration** tests assert the M2/M3→run→Finance chain; **UAT** covers operator-facing flows (registers, month-end, returns). This matrix is the acceptance basis for the completed M4 milestone; any new requirement is added here before it is built.

