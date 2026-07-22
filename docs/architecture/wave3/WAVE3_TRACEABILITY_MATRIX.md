# Wave 3 — Traceability Matrix (HRMS → Regulatory)

> **Requirement → Module → Screen → Database → API → Permissions → Reports → Test Cases.**
> Every Wave 3 requirement is mapped; no requirement is left unmapped. Milestones follow the
> approved build order (HRMS-first). Design source: the eight approved Wave 3 docs. DB entries
> are the SPEC target (implementation is milestone-gated; nothing here is executed until its
> milestone is approved). Reuse/extend existing tables; all policy via Administration.
>
> **Legend:** `[ext]` = extends an existing table (additive). Screens are routes under `/hrms`.
> Permission keys are seeded into the existing `permissions`/`role_permissions`. Tests: U=unit,
> I=integration, UAT=acceptance.

---

## Milestone M1 — Employee Master (+ minimal Foundation it requires)  — ✅ FROZEN (tag `v3.0-hrms-m1`)

*Design: HRMS_01_FOUNDATION · Business rules: §1, §3, §19.* Includes the org masters + configurable-policy framework the Employee Master references (Employee Master cannot function without department/designation/grade + the config resolver).

| Req ID | Requirement | Screen(s) | Database | API / RPC | Permissions | Reports | Test Cases |
|---|---|---|---|---|---|---|---|
| EM-01 | Company/branch/location config | `/hrms/setup/org` | `organizations`[ext], `office_locations`[ext], `hr_branches` | `listBranches`, `saveBranch` | `hrms.config.manage` | Org summary | U: FK integrity · I: branch→employee link · UAT: create branch |
| EM-02 | Departments / Divisions / Teams / Business Units / Cost Centres | `/hrms/setup/org` | `hr_departments`, `hr_divisions`, `hr_teams`, `hr_business_units`, `hr_cost_centres` | CRUD RPCs | `hrms.config.manage` | Dept summary | U: hierarchy · UAT: create dept |
| EM-03 | Designations / Grades / Employment Types | `/hrms/setup/org` | `hr_designations`, `hr_grades`, `hr_employment_types` | CRUD | `hrms.config.manage` | — | U: uniqueness · UAT: assign to employee |
| EM-04 | Reporting & Approval hierarchy | `/hrms/setup/hierarchy` | `hr_reporting_lines`, `hr_approval_chains`, `hr_approval_levels`, `profiles.reports_to`[ext] | `setReportingLine`, `resolveApprovers` | `hrms.config.manage` | Org chart | U: cycle-prevention · I: approver resolution · UAT: set manager |
| EM-05 | Configurable HR policy framework (no hardcoding) | `/hrms/setup/policies` (Administration) | `hr_policy_settings`, `attendance_settings`[ext], `feature_flags`[ext], `app_settings`[ext] | `get_hr_policy(scope,key)`, `setPolicy` | `hrms.config.manage` | Policy audit | U: most-specific-wins resolution · I: effective-date · UAT: change office timing |
| EM-06 | Employee Master — full profile | `/hrms/employees`, `/hrms/employees/:id` | `employee_details`[ext] + additive nullable cols | `listEmployees`, `getEmployee`, `saveEmployee` | `hrms.employee.view`, `.manage`, `.view.self` | Employee master, directory, demographics | U: validation · I: PII gating · UAT: create/edit employee |
| EM-07 | Personal/Employment/Salary/Bank/Govt-ID/PF/ESI/UAN/Nominee/Emergency | employee tabs | `employee_details`[ext], `hr_employee_bank`, `hr_employee_statutory_ids`, `hr_employee_nominees`, `hr_emergency_contacts` | child CRUD | `hrms.employee.manage` (sensitive: hr/director) | — | U: masking · I: sensitive-read audit · UAT: bank edit approval |
| EM-08 | Qualifications / Experience / Skills / Family / Medical | employee tabs | `hr_employee_qualifications`, `hr_employee_experience`, `hr_employee_skills`, `hr_employee_family`, `hr_employee_medical` | child CRUD | `hrms.employee.manage` | Skills matrix | U: CRUD · UAT: add qualification |
| EM-09 | Employee photo / digital signature / documents | employee tab | `employee_details`[ext] (photo), Document Management (documents) | DMS upload | `hrms.employee.manage` | — | I: DMS reuse (no dup storage) · UAT: upload doc |
| EM-10 | Transfer/Promotion/Salary-revision/Exit history | Lifecycle tab (read) | `hr_employee_status_events` (append-only) | `employeeHistory` | `hrms.employee.view` | History report | U: append-only · UAT: view history |
| EM-11 | Employee code auto-generation | on create | `hr_policy_settings` (`lifecycle.empcode_format`) | `generateEmployeeCode` | `hrms.employee.manage` | — | U: format/sequence · UAT: code on create |
| EM-12 | Audit on all employee events | (all) | `audit_log`[ext] via trigger | (trigger) | — | Audit report | I: INSERT/UPDATE logged · U: immutability |

**Cross-cutting M1:** RLS via `auth_role()` + self-scope; ESS read-self only; salary/PII visible to hr/director/super_admin only; module registered in `core/registry` + Sidebar (`/hrms`).

---

## Milestone M2 — Attendance  — ✅ FROZEN (tag `v3.0-hrms-m2`)

*Design: HRMS_02 Part A/B · Business rules: §2, §5, §6.*

| Req ID | Requirement | Screen(s) | Database | API / RPC | Permissions | Reports | Test Cases |
|---|---|---|---|---|---|---|---|
| AT-01 | Configurable attendance rules | `/hrms/setup/attendance` | `attendance_settings`[ext], `hr_policy_settings` | `get_hr_policy('attendance.*')` | `hrms.config.manage` | — | U: rule resolution · UAT: set grace time |
| AT-02 | Biometric / device punch | (device adapter) | `attendance_device_events`, `attendance_punches`[ext] | `ingestDeviceEvent` | `hrms.attendance.manage` | Biometric exceptions | I: device→punch · U: dedupe |
| AT-03 | GPS geofence + face-verify punch (reuse existing) | ESS punch | `attendance_punches`[ext] (existing geofence/face) | existing `record_punch` | `hrms.attendance.self` | — | I: reuse existing flow · UAT: punch in geofence |
| AT-04 | Manual attendance (HR) | `/hrms/attendance` | `attendance_punches`[ext] | `manualPunch` | `hrms.attendance.manage` | Muster | U: audit · UAT: HR manual entry |
| AT-05 | Missed punch → regularization | ESS | `attendance_regularizations` | `raiseRegularization`, `approveRegularization` | `hrms.attendance.self`, `.approve` | Regularization | I: approval chain · U: monthly cap · UAT: regularize |
| AT-06 | Late coming / early leaving | (evaluation) | derived; `attendance_days`[ext] | `evaluateDay` | — | Late/early | U: grace + late-to-halfday · UAT: 3-lates rule |
| AT-07 | Overtime (pre-approved) | ESS / manager | `attendance_overtime` | `requestOT`, `approveOT` | `hrms.attendance.*` | OT report | I: approval · U: OT calc → payroll input |
| AT-08 | Outdoor Duty / WFH | ESS | `outdoor_duty_requests` | `requestOD`, `approveOD` | `hrms.attendance.*` | OD report | I: counts-as-present · UAT: OD approval |
| AT-09 | Shift allocation & swap | `/hrms/attendance/shifts` | `hr_shifts`, `hr_shift_allocations`, `hr_shift_swaps` | `allocateShift`, `swapShift`, `resolveShift` | `hrms.shift.manage` | Roster | U: effective shift resolver · I: fallback to attendance_settings · UAT: allocate shift |
| AT-10 | Attendance correction workflow | `/hrms/attendance` | `attendance_corrections` | `correctAttendance` | `hrms.attendance.manage` | Correction audit | I: immutable punch + correction trail |
| AT-11 | Attendance approval | approvals inbox | (reuse approvals) | (workflow) | `hrms.attendance.approve` | — | I: unified inbox reuse |
| AT-12 | Attendance reports | `/hrms/reports/attendance` | read views | report RPCs | `hrms.attendance.view` | Daily/monthly muster, OT, OD, exceptions | UAT: monthly muster export |

---

## Milestone M3 — Leave Management  — ✅ FROZEN (tag `v3.0-hrms-m3`)

*Design: HRMS_02 Part C · Business rules: §7, §8.*

| Req ID | Requirement | Screen(s) | Database | API / RPC | Permissions | Reports | Test Cases |
|---|---|---|---|---|---|---|---|
| LV-01 | Configurable leave types + policy | `/hrms/setup/leave` | `hr_leave_types`, `hr_leave_policies`, `hr_policy_settings` | `saveLeaveType`, `get_hr_policy('leave.*')` | `hrms.config.manage` | — | U: policy resolution · UAT: add leave type |
| LV-02 | Leave balance (ledger) | ESS, `/hrms/leave` | `hr_leave_ledger`, `hr_leave_balances` | `getBalance`, `postLedger` | `hrms.leave.apply`, `.view` | Balance | U: ledger sum = balance · I: pending-hold |
| LV-03 | Apply / cancel leave | ESS | `hr_leave_requests` | `applyLeave`, `cancelLeave` | `hrms.leave.apply` | — | U: overlap/notice · I: balance hold · UAT: apply CL |
| LV-04 | Multi-level approval (HOD→HR→Director) | approvals inbox | `hr_leave_requests` | `approveLeave` | `hrms.leave.approve` | — | I: chain per §12 · UAT: approve >2 days |
| LV-05 | Accrual / carry-forward / expiry | scheduled job | `hr_leave_ledger` | `accrualJob`, `carryForwardJob` | (system) | Accrual | U: monthly accrual, cap, lapse · I: year-end |
| LV-06 | Encashment | `/hrms/leave/encash` | `hr_leave_encashments` | `encashLeave` | `hrms.leave.manage` | Encashment | U: EL-only, basis=Basic+DA · I: → payroll |
| LV-07 | Comp Off | ESS | `hr_comp_off` | `earnCompOff`, `useCompOff` | `hrms.leave.*` | Comp-off | U: 90-day validity · I: earned on worked-off |
| LV-08 | Holiday calendar + restricted holidays | `/hrms/setup/holidays`, ESS | `hr_holidays`, `hr_restricted_holiday_picks` | `saveHoliday`, `pickRestricted` | `hrms.config.manage`, ESS pick | Holiday list | U: branch override · UAT: pick RH |
| LV-09 | Sandwich rule | (evaluation) | policy `leave.sandwich` | `evaluateLeaveDays` | — | — | U: flanking-leave counts off-days · UAT: verify |
| LV-10 | Leave → payroll interface (LOP) | (boundary) | read model for payroll | `leaveInputsForPayroll` | (system) | LOP report | I: LOP feeds M4 (read-only) |
| LV-11 | Leave reports | `/hrms/reports/leave` | read views | report RPCs | `hrms.leave.view` | Balance, availed, LOP, **leave liability** | UAT: liability report |

---

## Milestone M4 — Payroll + Statutory

*Design: HRMS_03 · Business rules: §9, §10, §11.* Money = bigint paise. Finance disburses; HRMS never posts GL.

| Req ID | Requirement | Screen(s) | Database | API / RPC | Permissions | Reports | Test Cases |
|---|---|---|---|---|---|---|---|
| PY-01 | Configurable salary structure / CTC | `/hrms/payroll/structures` | `hr_salary_structures`, `hr_salary_components`, `hr_component_master` | `saveStructure`, `resolveCTC` | `hrms.salary.manage` | CTC vs net | U: CTC↔gross↔net · UAT: add component (no code) |
| PY-02 | Assign structure to employee (effective-dated) | `/hrms/payroll/structures` | `hr_employee_salary` | `assignSalary` | `hrms.salary.manage` | — | U: effective-date · I: revision history |
| PY-03 | Statutory config (PF/ESI/PT/TDS/Gratuity/Bonus/LWF) | `/hrms/setup/statutory` (Administration) | `hr_statutory_config` (versioned, effective-dated) | `get_hr_policy('statutory.*')` | `hrms.config.manage` | — | U: version/effective-date · UAT: change PF rate no code |
| PY-04 | Payroll run (monthly) | `/hrms/payroll/runs` | `hr_payroll_runs`, `hr_payroll_lines` | `createRun`, `computeRun`, `approveRun`, `lockRun` | `hrms.payroll.process`, `.approve` | Payroll register | U: calc vs expected · I: attendance/leave inputs · UAT: run→approve→lock |
| PY-05 | Statutory computation (PF/EPS/ESI/PT/TDS/Gratuity) | (within run) | `hr_payroll_statutory` | `computeStatutory` | (system) | PF ECR, ESI, PT, 24Q, Form16 | U: each statute edge cases · UAT: register exports |
| PY-06 | Earnings: bonus/incentive/OT/arrears | run inputs | `hr_payroll_adjustments`, `hr_arrears` | `addAdjustment`, `postArrears` | `hrms.payroll.process` | — | U: arrears recompute · I: OT from M2 |
| PY-07 | Loans & advances | `/hrms/payroll/loans` | `hr_loans`, `hr_loan_schedule` | `createLoan`, `amortize`, `recover` | `hrms.payroll.process` | Loans outstanding | U: amortization ledger · I: recovery in run |
| PY-08 | Reimbursements | ESS + `/hrms/payroll` | `hr_reimbursements` | `submitClaim`, `approveClaim` | `hrms.payroll.*` | Reimbursement | I: approval per §12 |
| PY-09 | Payslip generation | ESS, run | `hr_payslips` + DMS PDF | `generatePayslip` | payslip.self | Payslip batch | I: DMS storage · UAT: download payslip |
| PY-10 | Bank transfer file (NEFT) | run | export | `bankFile` | `hrms.payroll.approve` | Bank file | U: format · UAT: file matches net |
| PY-11 | Finance handoff (payout) | run→Finance | `payments`[ext] outflow + expense journal | `postPayrollToFinance` | `hrms.payroll.approve` | — | I: respects accounting-period lock · U: no direct GL by HRMS |
| PY-12 | Salary revision | Lifecycle | `hr_salary_revisions` | `reviseSalary` | `hrms.salary.manage` | Revision history | U: effective-date · UAT: revise → next run |
| PY-13 | Immutability & confidentiality | (all) | locked rows; RLS | (enforced) | salary→hr/director | Audit | U: locked run immutable · I: cross-read audit |
| PY-14 | Payroll reports | `/hrms/reports/payroll` | read views | report RPCs | `hrms.payroll.view` | Register, statutory, CTC, arrears, loans | UAT: payroll summary |

---

## Milestone M5 — Recruitment & Employee Lifecycle

*Design: HRMS_04 §1–3 · Business rules: §12, §13, §14.* Recruitment INTERNAL ONLY (no external/candidate portal).

| Req ID | Requirement | Screen(s) | Database | API / RPC | Permissions | Reports | Test Cases |
|---|---|---|---|---|---|---|---|
| RC-01 | Job requisition + approval | `/hrms/recruit/requisitions` | `hr_job_requisitions` | `createRequisition`, `approveRequisition` | `hrms.recruitment.requisition.*` | Requisition status | I: budget + approval chain · UAT: raise+approve |
| RC-02 | Internal job posting | `/hrms/recruit/postings` | `hr_job_postings` | `createPosting` | `hrms.recruitment.candidate.manage` | Openings | U: internal-only channel |
| RC-03 | Candidate database + resume | `/hrms/recruit/candidates` | `hr_candidates`, DMS resume | `addCandidate`, `moveStage` | `hrms.recruitment.candidate.manage` | Funnel | U: dedupe · I: DMS resume · UAT: pipeline board |
| RC-04 | Interview stages + feedback | candidate detail | `hr_interviews`, `hr_interview_feedback` | `scheduleInterview`, `submitFeedback` | `hrms.recruitment.interview.feedback` | Interview status | I: notifications · UAT: scorecard |
| RC-05 | Offer → accept → provision employee | `/hrms/recruit/offers` | `hr_offers` + DMS PDF | `createOffer`, `sendOffer`, `acceptOffer` | `hrms.recruitment.offer.manage` | Offer status | I: accept→pre-joining employee · UAT: offer flow |
| LC-01 | Onboarding checklist | `/hrms/lifecycle/onboarding` | `hr_onboarding`, `hr_onboarding_tasks`, `hr_onboarding_templates` | `startOnboarding`, `completeTask` | `hrms.onboarding.manage`, self | Onboarding status | I: template seed · UAT: complete checklist |
| LC-02 | Probation → confirmation | employee lifecycle tab | `hr_employee_status_events` | `confirmEmployee` | `hrms.lifecycle.manage` | Confirmations due | U: requires review+onboarding · UAT: confirm |
| LC-03 | Transfer / Promotion | lifecycle tab | `hr_employee_status_events`, `hr_transfers` | `transferEmployee`, `promoteEmployee` | `hrms.lifecycle.manage`, `.approve` | History | I: effective-date + CTC/grade change · UAT |
| LC-04 | Warning / Suspension | lifecycle tab | `hr_employee_status_events` + DMS | `recordStatusEvent`, `generateLetter` | `hrms.lifecycle.manage` | — | I: letter via DMS |
| LC-05 | Resignation → exit interview → clearance | `/hrms/lifecycle/separations` | `hr_separations`, `hr_exit_interviews` | `initiateSeparation`, `recordExitInterview` | `hrms.lifecycle.manage`, `.approve` | Exit report | I: asset-clearance gate · UAT: exit flow |
| LC-06 | Full & Final settlement | separation | `hr_fnf_settlements`, `payments`[ext] | `computeFnF`, `postFnFToFinance` | `hrms.lifecycle.approve` | F&F | I: payroll+leave+gratuity−recoveries · U: asset gate |
| LC-07 | Relieving / Experience letters | separation | DMS PDF from templates | `generateLetter('relieving'/'experience')` | `hrms.lifecycle.manage` | — | I: template + numbering · UAT: generate |

---

## Milestone M6 — Performance Management

*Design: HRMS_04 §4 · Business rules: §15.*

| Req ID | Requirement | Screen(s) | Database | API / RPC | Permissions | Reports | Test Cases |
|---|---|---|---|---|---|---|---|
| PF-01 | Configurable review cycles | `/hrms/performance/cycles` | `hr_review_cycles` | `openCycle` | `hrms.performance.cycle.manage` | — | U: cycle config · UAT: open cycle |
| PF-02 | Goals / KRA / KPI (weighted) | ESS, `/hrms/performance` | `hr_goals` | `setGoals` | `hrms.performance.goal.manage` | Goals progress | U: weights sum · UAT: cascade goals |
| PF-03 | Self → Manager → Calibration → Final | review screens | `hr_reviews` | `submitSelfReview`, `submitManagerReview`, `finalizeRating` | `hrms.performance.review.*` | Ratings distribution | I: stage workflow · UAT: full cycle |
| PF-04 | Increment/Promotion recommendation | review | `hr_recommendations` | `raiseRecommendation`, `approveRecommendation` | `hrms.performance.recommend.approve` | Recommendations | I: → salary revision (M4) · UAT: recommend |

---

## Milestone M7 — Training & Development

*Design: HRMS_04 §5 · Business rules: §16.* (Full LMS is future/out of scope.)

| Req ID | Requirement | Screen(s) | Database | API / RPC | Permissions | Reports | Test Cases |
|---|---|---|---|---|---|---|---|
| TR-01 | Training calendar (internal/external) | `/hrms/training` | `hr_trainings` | `createTraining` | `hrms.training.manage` | Training calendar/cost | U: CRUD · UAT: schedule |
| TR-02 | Enrolment / attendance / completion | training detail, ESS | `hr_training_enrolments` | `enrol`, `markAttendance` | `hrms.training.*` | Coverage | I: nomination + ESS request |
| TR-03 | Certification tracking + expiry | ESS, `/hrms/training/certs` | `hr_certifications` + DMS | `recordCertification`, `certExpiryScan` | `hrms.training.*` | Cert expiry | I: expiry reminder (Notifications) · UAT |
| TR-04 | Role-mandatory training | config | `hr_policy_settings` (`training.mandatory_by_role`) | (resolver) | `hrms.config.manage` | Compliance gap | U: mandatory-by-role |

---

## Milestone M8 — Asset Management

*Design: HRMS_04 §6 · Business rules: §17.*

| Req ID | Requirement | Screen(s) | Database | API / RPC | Permissions | Reports | Test Cases |
|---|---|---|---|---|---|---|---|
| AS-01 | Asset register (configurable categories) | `/hrms/assets` | `hr_assets` | `registerAsset` | `hrms.asset.manage` | Asset register | U: category config · UAT: add asset |
| AS-02 | Allocate / return (acknowledgement) | asset detail, ESS | `hr_asset_allocations` + DMS ack | `allocateAsset`, `returnAsset` | `hrms.asset.manage`, view.self | Allocations, pending returns | I: issue/return history · UAT: allocate |
| AS-03 | Exit clearance gate | separation | (join to allocations) | (gate in F&F) | — | — | I: F&F blocked until returns |
| AS-04 | Software licence expiry | assets | `hr_assets` (licence) | `licenceExpiryScan` | `hrms.asset.manage` | Licence expiry | I: reminder |

---

## Milestone M9 — Employee Self Service (ESS)

*Design: HRMS_04 §7 · Business rules: §18.* All rows self-scoped (`employee_id = auth.uid()`).

| Req ID | Requirement | Screen(s) | Database | API / RPC | Permissions | Reports | Test Cases |
|---|---|---|---|---|---|---|---|
| ESS-01 | My profile (view/edit permitted fields) | `/ess/profile` | `employee_details`[ext] | `getMyProfile`, `updateMyProfile` | `hrms.employee.view.self`, `ess.editable_fields` | — | U: self-scope RLS · I: sensitive→approval · UAT |
| ESS-02 | My attendance + punch + regularize | `/ess/attendance` | existing punch, `attendance_regularizations` | (reuse) | `hrms.attendance.self` | My attendance | I: reuse M2 |
| ESS-03 | My leave (apply/cancel/balance) | `/ess/leave` | `hr_leave_requests`, balances | (reuse M3) | `hrms.leave.apply` | My leave | I: reuse M3 |
| ESS-04 | My payslips / tax | `/ess/payslips` | `hr_payslips` | `myPayslips` | payslip.self | — | U: self-only · UAT: download |
| ESS-05 | My claims / assets / trainings / goals | `/ess/*` | (reuse respective) | (reuse) | self keys | — | I: reuse modules |
| ESS-06 | Directory + holidays + letters | `/ess/directory`, `/ess/letters` | limited views, DMS | `directory`, `myLetters` | `ess.directory_fields` | — | U: limited fields · UAT |

---

## Milestone M10 — Dashboards & Reports

*Design: HRMS_04 §8–10 · Business rules: §14, §15.* Reuse Reports & Analytics (read-only, RLS-aware).

| Req ID | Requirement | Screen(s) | Database | API / RPC | Permissions | Reports | Test Cases |
|---|---|---|---|---|---|---|---|
| DB-01 | Employee dashboard | `/ess` | read views | dashboard RPCs | `hrms.employee.view.self` | — | U: self-scope |
| DB-02 | Manager dashboard (team-scoped) | `/hrms/dashboard/manager` | read views (reports_to) | `managerDashboard` | `hrms.manager.dashboard.view` | Team attendance/leave/performance | I: team scope · U: no salary |
| DB-03 | HR dashboard | `/hrms/dashboard/hr` | read views | `hrDashboard` | `hrms.hr.dashboard.view` | Headcount, attrition, cost | UAT: drill-down |
| DB-04 | Director dashboard | `/hrms/dashboard/director` | read views | `directorDashboard` | `hrms.hr.dashboard.view` | Executive KPIs | UAT |
| RP-01 | All HR reports | `/hrms/reports/*` | read views | report RPCs | scoped `.view` keys | Attendance, Leave, Payroll, PF, ESI, PT, TDS, Joining, Exit, Birthday, Anniversary, Probation, Training, Performance, Assets, Dept summary, Employee summary, **Leave liability**, **Payroll summary** | UAT: each report export (Excel/PDF) |
| NT-01 | Notifications (all events) | (system) | notification ledger[ext] | scheduled scans + triggers | config `notify.*` | — | I: dedupe · U: channel/template config · UAT: approval alert |
| DG-01 | Document generation (all letters) | (system) | Administration templates + DMS | `generateLetter(type)` | `hrms.*.manage` | — | I: template + numbering + DMS · UAT: each letter |

---

## Part B — Regulatory Affairs (implemented ONLY after HRMS accepted)

*Design: REGULATORY_AFFAIRS_DESIGN.* Milestone-based (REG-M1…M4). Extends `licenses`, `authority_queries`, `soi_archive`/`soi_products`; govt fees via Finance `govt_fees`.

| Req ID | Requirement | Module/Screen | Database | API | Permissions | Reports | Test Cases |
|---|---|---|---|---|---|---|---|
| RG-01 | Client regulatory projects | `/regulatory/projects` | `client_regulatory_profiles`, `projects`[ext] | CRUD | `regulatory.project.*` | Project status | I: client link |
| RG-02 | Product & Ingredient master | `/regulatory/products` | `products`, `ingredients`, `fssai_categories` | CRUD | `regulatory.product.*` | Product list | U: category rules |
| RG-03 | Licences (FSSAI/FoSCoS) + renewals | `/regulatory/licences` | `licenses`[ext] | lifecycle + renewal RPCs | `regulatory.licence.*` | Licence/renewal | I: renewal reminder |
| RG-04 | Form II / Non-Specified Food / product approvals | `/regulatory/applications` | `product_approval_applications`, `lab_results` | CRUD | `regulatory.application.*` | Submission status | I: lab result link |
| RG-05 | Label & Claims review | `/regulatory/reviews` | `compliance_reviews`, `compliance_findings` + DMS | review workflow | `regulatory.review.*` | Review status | U: checklist-driven |
| RG-06 | Authority queries | `/regulatory/queries` | `authority_queries`[ext] | query→response→resolve | `regulatory.query.*` | Query ageing | I: reuse existing table |
| RG-07 | Government fees | (Finance) | `finance_govt_fees`[ext] | (Finance integration) | `finance.govtfee.manage` | Govt fee | I: Finance reuse |
| RG-08 | SOI archive/products | `/regulatory/soi` | `soi_archive`[ext], `soi_products`[ext] | (reuse) | `regulatory.soi.*` | SOI | I: reuse existing |
| RG-09 | Regulatory calendar + compliance dashboard | `/regulatory/dashboard` | `compliance_obligations`, `regulatory_rules` | obligations engine | `regulatory.compliance.view` | Compliance/overdue/health | I: reminders + escalation |
| RG-10 | Templates, reports, workflow automation | `/regulatory/*` | `templates`, read views | report + automation RPCs | scoped keys | Regulatory reports/analytics | UAT: templates + reports |

---

## Coverage confirmation

- **Directive §3–15 (HRMS)** → mapped across M1–M10 (config §3–8 → EM-05/AT-01/LV-01/PY-01/PY-03; office/working-days/leave/salary/statutory → EM-05, AT, LV, PY; recruitment internal-only → RC; lifecycle → LC; attendance → AT; payroll → PY; documents → DG-01/LC/PY-09; dashboards → DB; reports → RP-01).
- **Directive §16 (Regulatory)** → RG-01…RG-10 (post-HRMS).
- **Directive §18 standards / §19 deliverables** → enforced per milestone (each row's Test Cases column + the per-milestone deliverable set: DB, backend, frontend, permissions, validation, unit + integration tests, docs, UAT checklist, release notes).
- **No requirement unmapped.** Any new requirement must be added here before its milestone begins.

