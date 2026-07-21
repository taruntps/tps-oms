# HRMS — Business Rules & Company Policy Specification (Wave 3)

> **DESIGN ONLY — not implemented.** Defines every operational rule the HRMS will enforce.
> **Every value below is a CONFIGURABLE DEFAULT** held in the Administration module
> (`feature_flags` toggles + `app_settings` + effective-dated `hr_policy_settings`, resolved
> most-specific-wins by `get_hr_policy` — see `HRMS_01_FOUNDATION`). **Nothing is hardcoded**;
> defaults shown are seed values TPS Xperts Group can change without code. Statutory rates are
> versioned + effective-dated. Company = TPS Xperts Group (Mohali, Punjab, India).
> Companion to the Wave 3 design docs; this is the policy/rule layer.

## Legend
- **Rule** = what the system enforces. **Default** = seeded starting value (editable in Administration).
- **Scope** = level a rule can be overridden at: Company → Branch → Department → Grade → Employee (most-specific wins).
- **Config key** = the `hr_policy_settings` key (illustrative).

---

## 1. Company Policies (global)

| Rule | Default | Scope | Config key |
|---|---|---|---|
| Legal entity / employer name | TPS Xperts Group | Company | `company.legal_name` |
| Financial year | 1 Apr – 31 Mar | Company | `company.fy_start` |
| Base currency | INR (money stored as paise) | Company | `company.currency` |
| Time zone | Asia/Kolkata (IST) | Company | `company.timezone` |
| Probation period | 6 months | Grade/Employee | `lifecycle.probation_months` |
| Notice period (confirmed) | 30 days (probation: 15 days) | Grade | `lifecycle.notice_days` |
| Retirement age | 60 years | Company | `lifecycle.retirement_age` |
| Code of conduct / handbook | Published in Knowledge Base; acknowledgement required at onboarding | Company | `policy.handbook_ack_required` |
| Data privacy | Employee PII visible only to HR/Director/super_admin; cross-user sensitive reads audited | Company | `policy.pii_restricted` |

All company policies are documents in Knowledge Base + toggles/values in Administration; changing a value takes effect from its **effective date** without code changes.

---

## 2. Office Timings

| Rule | Default | Scope | Config key |
|---|---|---|---|
| Standard shift | 09:00–18:00 | Company/Branch/Shift | `attendance.shift.general` |
| Lunch/break (unpaid) | 60 min | Shift | `attendance.break_minutes` |
| Full-day minimum hours | 8h 00m (excl. break) | Shift | `attendance.full_day_hours` |
| Half-day threshold | ≥ 4h and < full-day | Shift | `attendance.half_day_hours` |
| Core hours (must be present) | 11:00–16:00 | Shift | `attendance.core_hours` |

Timings are **per shift** (see §6) and effective-dated; a policy change (e.g. summer timings) is a new effective-dated value.

---

## 3. Working Days

| Rule | Default | Scope | Config key |
|---|---|---|---|
| Working week | Monday–Friday | Company/Branch/Dept | `attendance.working_days` |
| Week pattern | 5-day week | Company | `attendance.week_pattern` |
| Alternate-Saturday option | Off (configurable to 1st/3rd Saturday working) | Branch | `attendance.saturday_rule` |

Working days are a configurable set; a branch or department may override (e.g. a support team on a 6-day week) — most-specific-wins.

---

## 4. Weekly Off Rules

| Rule | Default | Scope | Config key |
|---|---|---|---|
| Weekly off days | **All Saturdays + All Sundays** | Company/Branch/Dept | `attendance.weekly_off` |
| Weekly-off pay | Paid (not deducted) | Company | `attendance.weekly_off_paid` |
| Working on weekly off | Requires prior approval → eligible for **Comp Off** (§7) | Company | `attendance.weeklyoff_workedcomp` |
| Rotational weekly off (shift staff) | Supported per shift roster | Shift | `shift.rotational_off` |

Weekly-off must remain configurable because company policy may change (e.g. move to alternate-Saturday working).

---

## 5. Attendance Rules

| Rule | Default | Scope | Config key |
|---|---|---|---|
| Capture methods | Biometric / GPS-geofence punch (existing) / manual (HR) | Branch | `attendance.methods` |
| Grace time (late) | 10 min after shift start | Shift/Grade | `attendance.grace_late_min` |
| Late mark | After grace; **3 late marks = ½ day LOP** | Grade | `attendance.late_to_halfday` |
| Early-leaving grace | 10 min before shift end | Shift | `attendance.grace_early_min` |
| Minimum for present | ≥ full-day hours; else half-day/absent | Shift | `attendance.present_hours` |
| Missed punch | Employee raises **regularization** → manager approval (max 2/month) | Grade | `attendance.regularization_cap` |
| Absent without leave (AWOL) | Marked LOP; > 3 consecutive days → HR alert | Company | `attendance.awol_alert_days` |
| Overtime (OT) | Beyond full-day, pre-approved only; paid per §9 or comp-off | Grade | `attendance.ot_enabled` |
| Outdoor Duty (OD) | Client-visit/audit; counts as present with approval | Grade | `attendance.od_enabled` |
| Work From Home (WFH) | Allowed with approval; counts as present | Grade | `attendance.wfh_enabled` |
| Punch immutability | Raw punches immutable; corrections via regularization audit trail | Company | (enforced) |

---

## 6. Shift Rules

| Rule | Default | Scope | Config key |
|---|---|---|---|
| Shift catalogue | General (09:00–18:00) | Company | `shift.catalogue` |
| Shift allocation | Effective-dated per employee/team; default = General | Employee/Team | `shift.allocation` |
| Rotation | Supported (weekly/custom) for shift-based teams | Team | `shift.rotation_pattern` |
| Shift swap | Employee-requested → manager approval | Team | `shift.swap_enabled` |
| Night-shift allowance | Configurable (off by default; TPS is day-shift) | Grade | `shift.night_allowance` |
| Weekly-off within shift | Derived from roster; interacts with holiday calendar | Shift | `shift.off_pattern` |

Attendance evaluation (§5) resolves the employee's **effective shift** for the day; if shift module is off, it falls back to `attendance_settings` (backward compatible).

---

## 7. Leave Policies

**Leave types (default catalogue — all configurable):**
| Type | Code | Annual entitlement | Accrual | Carry-forward | Encashable | Paid |
|---|---|---|---|---|---|---|
| Casual Leave | CL | 12 / year | Monthly (1/month) | No (lapses) | No | Yes |
| Sick Leave | SL | 12 / year | Monthly | Up to 12 | No | Yes |
| Earned/Privilege Leave | EL/PL | 15 / year | Monthly (1.25/mo) | Up to 45 (cap) | Yes (on exit / annual) | Yes |
| Comp Off | CO | Earned (worked weekly-off/holiday) | On earning | 90-day validity | No | Yes |
| Maternity Leave | ML | 26 weeks | Statutory (Maternity Benefit Act) | n/a | n/a | Yes |
| Paternity Leave | PL2 | 5 days | On event | No | No | Yes |
| Leave Without Pay | LWP | Unlimited (unpaid) | n/a | n/a | No | No |

**Leave rules:**
| Rule | Default | Config key |
|---|---|---|
| Leave year | Financial year (1 Apr–31 Mar) | `leave.year_basis` |
| Minimum unit | 0.5 day (half-day) | `leave.min_unit` |
| Advance notice (planned) | 2 working days for CL/EL | `leave.notice_days` |
| Backdated SL | Allowed with proof for > 2 days | `leave.sl_proof_days` |
| **Sandwich rule** | Weekly-offs/holidays between leaves counted as leave if both flanking days are leave | `leave.sandwich` |
| Negative balance | Not allowed (except LWP) | `leave.allow_negative` |
| Accrual on LOP months | Pro-rated | `leave.accrual_on_lop` |
| Carry-forward processing | Year-end job caps + lapses per type | `leave.carryforward_job` |
| Encashment basis | Basic + DA, on EL only, at exit or annual window | `leave.encash_basis` |
| Approval | Multi-level per §12 | `leave.approval_chain` |

---

## 8. Holiday Calendar Rules

| Rule | Default | Config key |
|---|---|---|
| Calendar basis | Per calendar year, per branch (Punjab list) | `holiday.calendar` |
| Gazetted/National holidays | Republic Day, Independence Day, Gandhi Jayanti + state gazetted | `holiday.national` |
| Total holidays | ~12–14/year (configurable list) | `holiday.count` |
| **Restricted (optional) holidays** | 2 per employee per year from a restricted list | `holiday.restricted_quota` |
| Holiday on weekly-off | No compensatory day unless configured | `holiday.on_weeklyoff_comp` |
| Working on a holiday | Prior approval → Comp Off or OT pay | `holiday.worked_comp` |
| Branch-specific holidays | Supported (e.g. local festivals) | `holiday.branch_override` |

The holiday calendar is fully editable in Administration each year; restricted-holiday selection is an ESS action.

---

## 9. Payroll Policies

| Rule | Default | Config key |
|---|---|---|
| Payroll cycle | Monthly | `payroll.cycle` |
| Pay period | 1st–last of month | `payroll.period` |
| Cut-off (attendance freeze) | 25th of month | `payroll.cutoff_day` |
| Pay date | Last working day (or 1st of next month) | `payroll.pay_date` |
| LOP calculation basis | Calendar days (or fixed 30) | `payroll.lop_basis` |
| Payroll inputs | Attendance/LOP, leave, OT, comp-off, arrears, loans, reimbursements | (derived) |
| Approved run immutability | Locked after approval; corrections via **arrears** or **F&F** only | (enforced) |
| Payslip | Generated per employee, PDF via DMS, visible in ESS | `payroll.payslip_template` |
| Bank transfer | NEFT file generated; **disbursement human-executed** (ERP never moves money) | `payroll.bank_format` |
| GL/Finance | Payroll cost posted to Finance (`payments` outflow + expense journal), respecting accounting-period locks | (integration) |
| Rounding | Net rounded to nearest ₹1 | `payroll.rounding` |

---

## 10. Salary Components

**Default CTC structure (percentages configurable per grade):**
| Component | Type | Default rule | Config key |
|---|---|---|---|
| Basic | Earning (base) | 50% of gross (PF/gratuity wage base) | `salary.basic_pct` |
| HRA | Earning | 40% of Basic (metro 50%) | `salary.hra_pct` |
| Conveyance Allowance | Earning | Fixed / configurable | `salary.conveyance` |
| Special Allowance | Earning | Balancing figure | `salary.special` |
| Medical/Other Allowances | Earning | Configurable | `salary.other_allow` |
| Performance Pay/Incentive | Variable | Per performance (§15) | `salary.incentive` |
| PF (employee) | Deduction | 12% of PF wage | `statutory.pf_employee` |
| ESI (employee) | Deduction | 0.75% of gross (if eligible) | `statutory.esi_employee` |
| Professional Tax | Deduction | State slab (Punjab) | `statutory.pt` |
| TDS | Deduction | Per income-tax computation | `statutory.tds` |
| Loan/Advance recovery | Deduction | Per schedule (§9/loans) | `salary.loan_recovery` |

Employer contributions (PF 12% incl. EPS 8.33%, ESI 3.25%, EDLI, admin charges, gratuity provision) are **CTC components** and configurable. Each component carries flags: taxable, PF-wage, ESI-wage, part-of-gross.

---

## 11. Statutory Rules (configurable, versioned & effective-dated)

> All rates/thresholds are seeded but **editable in Administration** and change by **effective date** (statutory amendments never require code).

| Statute | Default rule (seed) | Config key |
|---|---|---|
| **PF (EPF)** | 12% employee + 12% employer; EPS 8.33% capped at ₹15,000 wage; EDLI + admin charges; UAN tracked | `statutory.pf.*` |
| **ESI** | 0.75% employee + 3.25% employer; eligibility gross ≤ ₹21,000/month; contribution-period stickiness (Apr–Sep / Oct–Mar) | `statutory.esi.*` |
| **Professional Tax (Punjab)** | Punjab State Development Tax ₹200/month for salaried above the income-tax exemption threshold | `statutory.pt.punjab` |
| **TDS (Sec 192)** | YTD projection with old/new regime, employee declarations, true-up; Form 16 / 24Q | `statutory.tds.*` |
| **Gratuity** | 15 days' wages (Basic+DA) per completed year after 5 years = last-wage × 15/26 × years; accrual provisioned | `statutory.gratuity.*` |
| **Bonus (Payment of Bonus Act)** | 8.33%–20%; eligibility wage ceiling ₹21,000; calculation ceiling ₹7,000/min-wage | `statutory.bonus.*` |
| **LWF (Labour Welfare Fund)** | Punjab LWF periodic contribution (if applicable) | `statutory.lwf.*` |
| **Minimum Wages** | Punjab schedule (compliance check) | `statutory.min_wage` |

Statutory registers/returns generated: PF ECR, ESI return, PT challan, TDS 24Q, Form 16, gratuity/bonus registers.

---

## 12. Approval Matrix (configurable chains)

Approval chains are defined in Administration (reusing the existing unified approvals inbox). Default levels:

| Request | L1 | L2 | L3 | Auto-rules |
|---|---|---|---|---|
| Leave (≤ 2 days) | Reporting Manager | — | — | auto-escalate if pending > 2 days |
| Leave (> 2 days / EL) | Reporting Manager | HR | — | |
| Attendance regularization | Reporting Manager | — | — | cap 2/month |
| Comp-off grant | Reporting Manager | HR | — | |
| Outdoor Duty / WFH | Reporting Manager | — | — | |
| Overtime | Reporting Manager | HR | — | pre-approval mandatory |
| Reimbursement/Travel claim | Reporting Manager | Accounts | — | policy-limit check |
| Loan / Salary advance | HR | Director | — | eligibility + max cap |
| Job requisition | Dept Head | HR | Director | budget check |
| Offer (CTC) | HR | Director | — | grade band check |
| Salary revision / promotion | HR | Director | — | |
| Separation / F&F | Reporting Manager | HR | Director | asset clearance gate |

Rules: configurable **levels, approvers (role or named), thresholds, auto-escalation SLA, delegation** (approver on leave → delegate). Every decision is audit-logged and notified.

---

## 13. Employee Lifecycle (rules)

| Stage | Rule | Config key |
|---|---|---|
| Pre-joining → Joining | Offer accepted → onboarding checklist seeded; employee code auto-generated | `lifecycle.empcode_format` |
| Probation | Default 6 months; review before end; extendable once | `lifecycle.probation_months` |
| Confirmation | Requires positive review + onboarding complete | `lifecycle.confirm_requires_review` |
| Transfer/Promotion | Effective-dated; writes history; may change grade/CTC/reporting | `lifecycle.*` |
| Warning/Suspension | Recorded event; document via DMS | — |
| Resignation | Notice period per §1; last-working-day computed | `lifecycle.notice_days` |
| Exit interview | Mandatory before F&F | `lifecycle.exit_interview_required` |
| Asset clearance | All assets returned before F&F payout | (gate) |
| F&F | Salary + leave encashment + gratuity − recoveries; via Finance | (integration) |
| Letters | Relieving + Experience auto-generated on F&F closure | `doc.letter_templates` |

---

## 14. Recruitment Rules

| Rule | Default | Config key |
|---|---|---|
| Requisition | Requires budget + approval before posting | `recruit.requisition_approval` |
| Posting | **Internal only** (no external candidate portal — internal ERP) | `recruit.channels` |
| Candidate dedupe | By email/phone | `recruit.dedupe` |
| Interview pipeline | Screening → Technical → HR → Final (configurable stages) | `recruit.stages` |
| Feedback | Scorecard per interviewer; consolidated recommendation | `recruit.scorecard` |
| Offer | Within approved grade CTC band; validity default 7 days | `recruit.offer_validity_days` |
| Offer acceptance | Provisions a draft Employee Master (pre-joining) | (workflow) |

---

## 15. Performance Review Rules

| Rule | Default | Config key |
|---|---|---|
| Review cycle | Annual (Apr–Mar) + optional quarterly check-ins | `perf.cycle` |
| Framework | Weighted KRA/KPI + goals | `perf.framework` |
| Stages | Self → Manager → Calibration → Final | `perf.stages` |
| Rating scale | 1–5 (configurable labels) | `perf.rating_scale` |
| Eligibility | Confirmed employees; pro-rated for mid-year joiners | `perf.eligibility` |
| Outcome | Increment/promotion **recommendation** only → approval → salary revision | `perf.outcome_link` |
| Increment window | Effective 1 April (configurable) | `perf.increment_effective` |

---

## 16. Training Rules

| Rule | Default | Config key |
|---|---|---|
| Training types | Internal / External | `training.types` |
| Nomination | Manager/HR nominate; ESS self-request | `training.nomination` |
| Attendance | Marked; completion recorded | `training.completion` |
| Certification | Tracked with expiry; renewal reminder before expiry | `training.cert_reminder_days` |
| Mandatory training | Configurable per role (e.g. FoSTaC for regulatory staff) | `training.mandatory_by_role` |
| Cost | Recorded (external), reportable | `training.cost_tracking` |
| Bond/recovery (if any) | Configurable (off by default) | `training.bond` |

---

## 17. Asset Assignment Rules

| Rule | Default | Config key |
|---|---|---|
| Asset categories | Laptop, Desktop, Phone, SIM, ID/Access card, Software licence, Furniture (configurable) | `asset.categories` |
| Allocation | Issued with condition + employee acknowledgement (DMS) | `asset.ack_required` |
| Return | On exit/transfer; condition recorded; damage recovery per policy | `asset.return_policy` |
| Exit gate | F&F blocked until all assets returned/cleared | (gate) |
| Software licences | Tracked with renewal/expiry | `asset.license_expiry` |
| Audit | Periodic asset audit report | `asset.audit_cycle` |

---

## 18. Employee Self-Service Rules

| Rule | Default | Config key |
|---|---|---|
| Self data scope | Employee sees/edits ONLY own records (RLS `employee_id = auth.uid()`) | (enforced) |
| Editable fields | Address, emergency contacts, personal phone/email | `ess.editable_fields` |
| Sensitive fields | Bank/PAN/salary changes → HR approval | `ess.sensitive_requires_approval` |
| ESS actions | Punch, leave apply/cancel, regularization, claims, restricted-holiday pick, payslip download, document upload, view goals/trainings/assets | `ess.enabled_actions` |
| Directory | Limited fields visible company-wide | `ess.directory_fields` |
| Mobile | ESS responsive/mobile-first | (design) |

---

## 19. HR Roles & Permissions

Reuse the existing Administration grant framework (`permissions`/`role_permissions`, `auth_role()`, `useCan()`). Default role capabilities:

| Role | HRMS capability |
|---|---|
| **employee** | ESS only (own data) |
| **manager** | Team: attendance/leave/regularization/claims approvals, team performance, team dashboard, requisition/interview feedback — **no salary visibility** |
| **hr** | Full HR ops: employee master, config, leave/attendance admin, payroll processing, recruitment, lifecycle, performance cycles, training, assets, HR dashboard, reports |
| **accounts** | Payroll view, reimbursement approval, Finance payout handoff |
| **director** | Approvals (offers/salary/promotion/separation), full visibility, HR + executive dashboards |
| **super_admin** | All + configuration + permission management |

Permission keys are `hrms.<area>.<action>` (full matrix in `HRMS_04` §12). Confidentiality: salary/PII restricted to hr/director/super_admin; sensitive cross-user reads audited. All keys and their role grants are **editable in Administration** (no hardcoded role checks in business rules).

---

## 20. Notification Rules

Reuse existing Notifications (email / SMS / WhatsApp toggle / in-app). Each trigger is **configurable**: on/off, channel(s), recipient, template, timing.

| Event | Default channel | Recipient | Config key |
|---|---|---|---|
| Approval pending / decided | in-app + email | approver / requester | `notify.approval` |
| Missed punch / AWOL | in-app + email | employee + manager | `notify.attendance` |
| Leave balance low / lapse warning | in-app | employee | `notify.leave` |
| Payslip published / salary credited | email | employee | `notify.payroll` |
| Statutory due reminder | in-app + email | HR/Accounts | `notify.statutory` |
| Probation ending / confirmation due | in-app + email | HR + manager | `notify.lifecycle` |
| Contract/certification expiry | in-app + email | HR + employee | `notify.expiry` |
| Birthday / work anniversary | in-app | company/team | `notify.celebration` |

Time-based triggers run via the existing `pg_cron`/edge scheduled-scan pattern; dedupe via the notification ledger. WhatsApp gated by the existing BSP toggle (stubbed until the number is live).

---

## 21. Document Generation Rules

| Rule | Default | Config key |
|---|---|---|
| Templated documents | Offer, appointment, confirmation, transfer/promotion, warning, relieving, experience letters; payslip; Form 16 | `doc.templates` |
| Template source | Administration-managed templates (merge fields) | `doc.template_store` |
| Storage | Generated PDFs stored/versioned in **Document Management** (no duplicate storage) | (integration) |
| Numbering | Configurable letter/document numbering series | `doc.numbering` |
| Signatures | Authorized-signatory + optional digital signature | `doc.signature` |
| Access | Employee downloads own letters via ESS; HR full access | (RLS) |

---

## 22. Audit & Compliance Rules

| Rule | Default | Enforcement |
|---|---|---|
| Audit trail | Every HR business event (lifecycle, payroll run, salary change, approvals, config changes) → append-only `audit_log` | trigger-enforced |
| Immutability | `audit_log` is INSERT+SELECT only (no update/delete) | RLS |
| Approved-run immutability | Payroll runs/payslips/salary structures locked after approval | enforced |
| Sensitive access logging | Cross-user reads of salary/PII logged | policy |
| Retention | Statutory retention (PF/ESI/payroll ≥ 7 years; personnel files per policy) | `compliance.retention` |
| Statutory compliance calendar | PF/ESI/PT/TDS due dates tracked + reminded | `compliance.calendar` |
| Data privacy | PII access restricted; export controlled | `policy.pii_restricted` |
| Segregation of duties | Payroll processor ≠ approver; disbursement human-executed | approval matrix |

---

## Configurability guarantee (summary)

- **Every rule above is a value/toggle in the Administration module** — resolved by `get_hr_policy` (Company → Branch → Department → Grade → Employee, most-specific-wins), backed by `hr_policy_settings` (typed, scoped, effective-dated) + `feature_flags` + `app_settings`.
- **Statutory rates are versioned + effective-dated** — amendments are configuration, never code.
- **No policy is hardcoded.** Seed defaults are TPS-appropriate starting points; the company changes them without a deployment.
- Changing a rule takes effect from its **effective date** and is itself **audit-logged**.

## Stop condition
Design/policy document only — **no code, SQL, migrations, or components produced.** Await user review + approval before implementation.


