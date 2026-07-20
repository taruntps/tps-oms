# HRMS — Talent, Lifecycle & Experience (Wave 3 Design)

> **DESIGN ONLY — not implemented.** DB shown as specification (not migrations). Reuses/extends
> `employee_details`, `profiles`; reuses Document Management, Knowledge Base, Notifications,
> Audit Log, Administration (roles/permissions/settings/feature-flags). All policy configurable
> via Administration; additive/backward-compatible; ERP is the system of record.
> Companion to `HRMS_01_FOUNDATION`, `HRMS_02_TIME_ATTENDANCE_LEAVE`, `HRMS_03_PAYROLL_STATUTORY`.

## Conventions
- **Money** = `bigint` paise. **Dates** = `date`; timestamps `timestamptz`.
- All new tables carry `id uuid pk`, `created_at`, `updated_at`, `created_by` and are covered by
  the generic **audit trigger** (`fn_audit_wave2`-style) → append-only `audit_log`.
- RLS via existing `auth_role()` + grant framework; **ESS rows are self-scoped** (employee sees
  only their own records) via `employee_id = auth.uid()`-style policies.
- Permission keys follow `hrms.<area>.<action>` and are seeded into `permissions`/`role_permissions`.

---

## 1. Recruitment

### 1.1 Functional Requirements
- Raise a **job requisition** (department, designation, grade, headcount, budget, justification) → **hiring approval** chain (reuse Approval Hierarchy from `HRMS_01`).
- **Job posting** (internal / external) once approved; public/portal posting is a future surface (design the interface, do not build a portal — Constitution excludes external portals).
- **Candidate database** with resume upload (Document Management), source tracking, duplicate detection by email/phone.
- **Interview stages** (configurable pipeline: Screening → Technical → HR → Final) with **feedback** per stage and per interviewer (scorecards).
- **Offer letter** generation (template via Administration; PDF via DMS) → accept/decline → **joining workflow** that seeds the Employee Master (`employee_details`) on join.

### 1.2 Technical Design
- Requisition → approval → posting → applications → interviews → offer → hire is a **status pipeline** with an audit trail; each transition writes `audit_log`.
- Offer acceptance triggers an **onboarding** record (§2) and a draft `employee_details` row (status `pre_joining`).
- Interview scheduling reuses **Notifications** (email/WhatsApp) and optionally Calendar.

### 1.3 Database Design (spec — new tables)
| Table | Key columns | Notes |
|---|---|---|
| `hr_job_requisitions` | department_id, designation_id, grade_id, headcount, status(`draft/pending/approved/on_hold/closed`), budget_ctc bigint, raised_by, approved_by | approval via reusable approval chain |
| `hr_job_postings` | requisition_id fk, title, description, channel(`internal/external`), status, valid_until | |
| `hr_candidates` | name, email, phone, source, resume_document_id, current_ctc bigint, expected_ctc bigint, status(`new/screening/interview/offer/hired/rejected`) | dedupe on (email/phone) |
| `hr_candidate_applications` | candidate_id fk, posting_id fk, stage, status | one row per candidate×posting |
| `hr_interviews` | application_id fk, stage, scheduled_at, interviewer_id, status | |
| `hr_interview_feedback` | interview_id fk, interviewer_id, score numeric, recommendation(`hire/hold/reject`), notes | scorecard |
| `hr_offers` | application_id fk, ctc bigint, joining_date, template_id, document_id, status(`draft/sent/accepted/declined/expired`) | PDF via DMS |

### 1.4 UI Design
- **Recruitment** nav group (HR/Manager): *Requisitions* (list + create + approve), *Candidates* (pipeline board by stage), *Candidate detail* (resume, applications, interviews, feedback), *Offers*.
- Kanban pipeline board for candidates; requisition approval inbox (reuse unified approvals).

### 1.5 Workflow
1. Manager raises requisition → 2. Approval chain (Manager → HR → Director per Administration config) → 3. HR posts → 4. Candidates added/screened → 5. Interviews scheduled + feedback → 6. Offer drafted → approved → sent → 7. Accepted → onboarding record created + `employee_details` draft.

### 1.6 Permission Matrix (excerpt)
| Key | executive | manager | hr | director | super_admin |
|---|---|---|---|---|---|
| `hrms.recruitment.requisition.raise` | – | ✓ | ✓ | ✓ | ✓ |
| `hrms.recruitment.requisition.approve` | – | – | ✓ | ✓ | ✓ |
| `hrms.recruitment.candidate.manage` | – | – | ✓ | ✓ | ✓ |
| `hrms.recruitment.interview.feedback` | – | ✓ | ✓ | ✓ | ✓ |
| `hrms.recruitment.offer.manage` | – | – | ✓ | ✓ | ✓ |

### 1.7 API (described — RPC/endpoints, not coded)
`createRequisition`, `approveRequisition`, `createPosting`, `addCandidate`, `moveCandidateStage`, `scheduleInterview`, `submitInterviewFeedback`, `createOffer`, `sendOffer`, `acceptOffer→provisionEmployee`.

---

## 2. Onboarding

### 2.1 Functional Requirements
- Configurable **onboarding checklist** (templates via Administration) — document collection, asset allocation (§6), IT/email setup, induction, policy acknowledgements.
- Track completion per task with owner + due date; block confirmation until mandatory items done.

### 2.2 Database Design (spec)
| Table | Key columns | Notes |
|---|---|---|
| `hr_onboarding` | employee_id fk, template_id, status(`in_progress/completed`), started_at, completed_at | one per joiner |
| `hr_onboarding_tasks` | onboarding_id fk, title, owner_id, due_date, status, document_id | seeded from template |
| `hr_onboarding_templates` | name, tasks jsonb (configurable via Administration) | |

### 2.3 UI / Workflow / Permissions
- ESS + HR onboarding checklist screen; HR marks tasks; employee uploads documents (DMS).
- `hrms.onboarding.manage` (HR), `hrms.onboarding.view.self` (employee).

---

## 3. Employee Lifecycle

### 3.1 Functional Requirements
Cover: **joining, probation, confirmation, transfer, promotion, salary revision, warning, suspension, resignation, exit interview, full & final settlement (F&F), relieving letter, experience letter.** Each is an auditable event with effective-date + approval; letters generated from Administration templates via DMS.

### 3.2 Technical Design
- Lifecycle events are **effective-dated history rows** (never overwrite; append) referenced from `employee_details`. Status transitions: `pre_joining → probation → confirmed → (transferred/promoted…) → notice → exited`.
- **F&F** integrates with **Payroll** (`HRMS_03`) for final dues (salary, leave encashment, gratuity, recoveries) and with **Finance** for the payout; **asset returns** (§6) must be cleared.
- **Salary revision** writes to the salary-revision history (see `HRMS_03`) and updates the active salary structure with an effective date.

### 3.3 Database Design (spec — child/history tables keyed to `profiles.id`)
| Table | Key columns | Notes |
|---|---|---|
| `hr_employee_status_events` | employee_id, event_type(`probation/confirmation/transfer/promotion/warning/suspension/resignation/exit`), effective_date, from_value, to_value, approved_by, notes, document_id | single append-only lifecycle log |
| `hr_transfers` | employee_id, from_branch/dept, to_branch/dept, effective_date | (or fold into status_events) |
| `hr_separations` | employee_id, type(`resignation/termination/retirement`), notice_date, last_working_day, reason, exit_interview_id, fnf_status | |
| `hr_exit_interviews` | separation_id fk, questionnaire jsonb, sentiment, notes | |
| `hr_fnf_settlements` | separation_id fk, payable bigint, recoverable bigint, net bigint, finance_payment_id fk, status | Finance handoff |

### 3.4 UI / Workflow / Permissions
- Employee detail → **Lifecycle** tab (timeline of events + actions: confirm, transfer, promote, revise salary, initiate exit).
- Exit workflow: resignation → approval → exit interview → asset clearance → F&F compute → Finance payout → relieving/experience letters.
- `hrms.lifecycle.manage` (HR/Director), `hrms.lifecycle.approve` (Director), salary-revision gated by `hrms.salary.manage`.

### 3.5 API
`recordStatusEvent`, `confirmEmployee`, `transferEmployee`, `promoteEmployee`, `initiateSeparation`, `recordExitInterview`, `computeFnF`, `generateLetter(type)`.

---

## 4. Performance Management

### 4.1 Functional Requirements
- **Goals / KRAs / KPIs** set per employee per review cycle (configurable cycles: quarterly/annual via Administration), cascaded from department/manager.
- **Review workflow**: Self review → Manager review → (optional) skip-level/HR calibration → final rating.
- **Increment & promotion recommendations** feed the salary-revision / promotion lifecycle events (§3) and Payroll (`HRMS_03`) — recommendation only; approval separate.

### 4.2 Database Design (spec)
| Table | Key columns | Notes |
|---|---|---|
| `hr_review_cycles` | name, period_start, period_end, type(`quarterly/annual`), status | configurable |
| `hr_goals` | employee_id, cycle_id, category(`KRA/KPI/goal`), title, weight numeric, target, status | weighted |
| `hr_reviews` | employee_id, cycle_id, stage(`self/manager/calibration/final`), reviewer_id, rating numeric, comments, status | one per stage |
| `hr_recommendations` | review_id fk, type(`increment/promotion`), proposed_value, status(`proposed/approved/rejected`) | → lifecycle/payroll |

### 4.3 UI / Workflow / Permissions
- ESS: *My Goals*, *My Reviews* (self-review form). Manager: team review queue + ratings. HR: cycle setup + calibration + reports.
- Workflow: HR opens cycle → goals set → self review → manager review → calibration → final rating → recommendations → (approval → salary revision).
- `hrms.performance.goal.manage`, `hrms.performance.review.self`, `hrms.performance.review.manager`, `hrms.performance.cycle.manage` (HR), `hrms.performance.recommend.approve` (Director).

### 4.4 API
`openCycle`, `setGoals`, `submitSelfReview`, `submitManagerReview`, `finalizeRating`, `raiseRecommendation`, `approveRecommendation`.

---

## 5. Training & Development

> Note: a full **LMS is a FUTURE module** (out of Wave 3 scope). Wave 3 provides **training tracking** and defines the interface an LMS could later extend.

### 5.1 Functional Requirements
- **Training calendar** (internal/external sessions), nominations/enrolment, attendance, **certification tracking** (with expiry → renewal reminders via Notifications), training history per employee, training reports (coverage, cost, effectiveness).
- Competence/certification records feed Regulatory (e.g., FoSTaC/lead-auditor competence) and can be surfaced against roles.

### 5.2 Database Design (spec)
| Table | Key columns | Notes |
|---|---|---|
| `hr_trainings` | title, type(`internal/external`), trainer, start/end, cost bigint, status | |
| `hr_training_enrolments` | training_id fk, employee_id, status(`nominated/attended/completed/no_show`), score | |
| `hr_certifications` | employee_id, name, authority, issued_on, expires_on, document_id | expiry → reminder |

### 5.3 UI / Workflow / Permissions
- HR: training calendar + enrolments + certifications. ESS: my trainings + certificates (upload to DMS).
- `hrms.training.manage` (HR), `hrms.training.view.self` (employee). Expiry reminders via Notifications (§11).

### 5.4 API
`createTraining`, `enrol`, `markAttendance`, `recordCertification`, `certificationExpiryScan` (scheduled).

---

## 6. Asset Management

### 6.1 Functional Requirements
- Track any company-issued asset: **laptop, desktop, phone, SIM, ID card, access card, software license, furniture**, etc. Asset register + **issue/return** to employees with condition + acknowledgement; return clearance is a gate in **exit** (§3).
- Configurable asset categories via Administration.

### 6.2 Database Design (spec)
| Table | Key columns | Notes |
|---|---|---|
| `hr_assets` | category, asset_tag, description, serial_no, purchase_date, cost bigint, status(`in_stock/issued/repair/retired`) | asset register |
| `hr_asset_allocations` | asset_id fk, employee_id, issued_on, returned_on, condition_out, condition_in, ack_document_id | issue/return history |

### 6.3 UI / Workflow / Permissions
- HR/Admin: asset register + allocate/return. ESS: my assets. Exit workflow checks all assets returned before F&F.
- `hrms.asset.manage` (HR/Admin), `hrms.asset.view.self` (employee).

### 6.4 API
`registerAsset`, `allocateAsset`, `returnAsset`, `employeeAssets(employeeId)`.

---

## 7. Employee Self Service (ESS)

Self-scoped portal for every employee (RLS: `employee_id = auth.uid()`):
- **Profile** — view/update permitted fields (address, emergency contacts, bank — change goes through HR approval where sensitive).
- **Attendance** — punch (reuse existing geofence/face-verify), view my attendance, raise **regularization/correction** (`HRMS_02`).
- **Leave** — apply, view balance/history, cancel pending (`HRMS_02`).
- **Payslips** — view/download my payslips + tax statements (`HRMS_03`).
- **Claims** — submit reimbursement/travel claims (`HRMS_03` T&E).
- **Documents & letters** — download offer/relieving/experience letters; upload requested documents (DMS).
- **Holidays** — view holiday calendar; **directory** — company directory (limited fields).
- **My goals/reviews**, **my trainings/certifications**, **my assets**.

Permissions: `hrms.ess.*` self-scoped keys; every ESS read/write policy enforces ownership.

---

## 8. Manager Dashboard

For reporting managers (scoped to their reportees via the Reporting Hierarchy from `HRMS_01`):
- **Approvals inbox** — leave, regularization, comp-off, claims, requisitions (reuse the existing unified approvals inbox).
- **Team attendance** — today's presence/absence/late/OD; team leave calendar.
- **Team performance** — review queue, goals progress.
- **Team roster/shifts**; open requisitions; team headcount.
- Permission: `hrms.manager.dashboard.view` + data scoped to `reports_to = manager`.

---

## 9. HR Dashboard (Executive)

For HR/Director/super_admin:
- **Headcount** (by department/branch/grade/employment-type), joiners/leavers, **attrition %**, tenure distribution.
- **Attendance** health (present %, late trend, OD), **leave** liability (balance × cost).
- **Payroll cost** (monthly, YoY), statutory dues status, **upcoming** confirmations, probation-ends, contract expiries, certification/renewal expiries, birthdays/anniversaries.
- Drill-down + export (reuse Reports module). Permission: `hrms.hr.dashboard.view`.

---

## 10. Reports (enumerated)

| Domain | Reports |
|---|---|
| Employee | Master/directory, joiners, leavers, confirmations due, probation status, transfer/promotion history, headcount/demographics |
| Attendance | Daily/monthly muster, late/early, OT, OD, regularizations, biometric exceptions |
| Leave | Balance, availed, encashment, LOP, leave liability |
| Payroll | Payroll register, payslip batch, bank transfer file, statutory (PF/ECR, ESI, PT, TDS/24Q), CTC vs net, arrears, loans outstanding, reimbursements |
| Talent | Recruitment funnel, offer status, performance ratings distribution, training coverage/cost, certification expiry |
| Asset | Asset register, allocations, pending returns |

All reports reuse the **Reports & Analytics** module (read-only, RLS-aware) with role-scoped access + export (Excel/PDF via existing infra).

---

## 11. Notifications

Reuse the existing **Notifications** infra (email / SMS / WhatsApp toggle / in-app). Triggers (configurable on/off + channel + template via Administration):
- **Approvals**: leave/regularization/claim/requisition/offer pending & decision alerts.
- **Attendance**: missed-punch, late, absent-without-leave nudges.
- **Payroll**: payslip published, salary credited, statutory due reminders.
- **Lifecycle**: probation-ending, confirmation due, contract expiry, birthday, work anniversary.
- **Training/Compliance**: certification expiry, mandatory-training due.
Scheduled scans (existing `pg_cron`/edge pattern, e.g. `daily-reminders`) drive time-based triggers; dedupe via the existing notification ledger.

---

## 12. Permission Matrix (module-wide, reusing Administration)

HRMS permissions are seeded into the existing `permissions`/`role_permissions` framework and enforced by RLS (`auth_role()`) + `useCan()` in the UI. **ESS keys are self-scoped** (own data only). Roles below are the existing enum values.

| Permission key | employee (ESS) | manager | hr | accounts | director | super_admin |
|---|---|---|---|---|---|---|
| `hrms.employee.view.self` | ✓ | – | – | – | – | – |
| `hrms.employee.view` (team/all) | – | team | ✓ | – | ✓ | ✓ |
| `hrms.employee.manage` | – | – | ✓ | – | ✓ | ✓ |
| `hrms.config.manage` (org/HR settings) | – | – | ✓ | – | ✓ | ✓ |
| `hrms.attendance.*` (self/team/all) | self | team | ✓ | – | ✓ | ✓ |
| `hrms.leave.apply` / `.approve` / `.manage` | apply | approve | manage | – | approve | manage |
| `hrms.payroll.view` / `.process` / `.approve` | payslip.self | – | process | view | approve | ✓ |
| `hrms.salary.view` / `.manage` | – | – | ✓ | – | ✓ | ✓ |
| `hrms.recruitment.*` | – | requisition/feedback | ✓ | – | approve | ✓ |
| `hrms.performance.*` | self | manager | cycle/calibrate | – | recommend.approve | ✓ |
| `hrms.training.*` | view.self | – | manage | – | ✓ | ✓ |
| `hrms.asset.*` | view.self | – | manage | – | ✓ | ✓ |
| `hrms.lifecycle.manage` / `.approve` | – | – | manage | – | approve | ✓ |
| `hrms.manager.dashboard.view` | – | ✓ | ✓ | – | ✓ | ✓ |
| `hrms.hr.dashboard.view` | – | – | ✓ | – | ✓ | ✓ |

**Confidentiality:** salary/PII visibility restricted to `hr`/`director`/`super_admin`; managers see operational (attendance/leave/performance) but NOT salary; cross-user reads of sensitive data are audit-logged.

## 13. Integration with existing ERP modules

| Module | Integration |
|---|---|
| **Administration** | All HR policy config (settings/feature-flags), roles & permission keys, approval hierarchy definitions. |
| **Audit Log** | Every HR event (lifecycle, payroll run, salary change, approvals) → append-only `audit_log`. |
| **Document Management** | Employee documents, resumes, offer/relieving/experience letters, payslips, certificates — all stored/versioned in DMS (no duplicate storage). |
| **Notifications** | Email/SMS/WhatsApp/in-app for approvals + time-based reminders (§11). |
| **Finance** (Wave 2) | Payroll payout → Finance `payments` outflow + expense journal (respect `accounting_periods` locks); F&F settlement payout; T&E reimbursement approval→payout→optional bill-to-client. HRMS never moves money or posts GL directly. |
| **CRM / Operations** | Employee = owner/assignee on leads/deals/projects (reuse `profiles`); capacity/availability from attendance/leave can inform Operations scheduling. |
| **Regulatory** | Employee certifications/competence (FoSTaC, lead-auditor) surfaced to Regulatory role-competence checks. |
| **Knowledge Base** | HR policies, handbook, SOPs published in KB; ESS links to them. |
| **Reports & Analytics** | All HR reports/dashboards via the read-only, RLS-aware Reports module. |

## 14. New tables introduced by this document (summary)
Recruitment: `hr_job_requisitions`, `hr_job_postings`, `hr_candidates`, `hr_candidate_applications`, `hr_interviews`, `hr_interview_feedback`, `hr_offers`. Onboarding: `hr_onboarding`, `hr_onboarding_tasks`, `hr_onboarding_templates`. Lifecycle: `hr_employee_status_events`, `hr_transfers`, `hr_separations`, `hr_exit_interviews`, `hr_fnf_settlements`. Performance: `hr_review_cycles`, `hr_goals`, `hr_reviews`, `hr_recommendations`. Training: `hr_trainings`, `hr_training_enrolments`, `hr_certifications`. Assets: `hr_assets`, `hr_asset_allocations`. **All additive, audited, RLS-scoped; none duplicate `profiles`/`employee_details`.**
