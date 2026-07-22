# HRMS Milestone M3 — Leave Management — As-Built, Lifecycle Review, UAT & Release Notes

> **Status:** Implemented on `staging`, awaiting user review/approval to FREEZE.
> Design: `HRMS_02` Part C, `HRMS_BUSINESS_RULES_AND_POLICY` §6/§7, traceability LV-01…LV-11.
> Constitution: additive/EXPAND, reuse-before-create, nothing hardcoded, frozen M1/M2 untouched.

## 1. As-built
- **DB:** migration `090` (leave schema + configurable status/day-type masters), `091` (leave-request attachment: `document_id` + `attachment_url`), `092` (Leave↔Attendance sync trigger). All additive.
- **Frontend** (`src/modules/hrms/`): My Leave, team Leave, Leave Approvals, Leave Setup, Leave Reports, Attendance-Status master config.
- **Permissions:** `hrms.leave.apply/view/approve/manage`.
- **Enhancement delivered:** configurable **`hr_attendance_statuses` + `hr_day_types`** masters (normalizing M2's status vocabulary configurably) — frozen M2 untouched.

## 2. Leave lifecycle verification (your 10 points)

### 2.1 Leave entities & relationships
| Entity | Role | Relationships |
|---|---|---|
| `hr_leave_types` | Configurable leave catalogue (CL/SL/EL/CO/ML/PL/LWP + quota/carry-forward/encashable/proof/applies_to) | referenced by ledger/requests/encashments |
| `hr_leave_ledger` | Signed-quantity balance ledger | `employee_id → profiles`, `leave_type_id → hr_leave_types` |
| `hr_leave_requests` | Leave applications (+ attachment) | `employee_id`, `approver_id → profiles`, `leave_type_id` |
| `hr_holidays` | Holiday calendar | `branch_id → office_locations` |
| `hr_restricted_holiday_picks` | Employee RH selections | `employee_id`, `holiday_id → hr_holidays` |
| `hr_comp_off` | Comp-off ledger (from M2 OT/holiday-work) | `employee_id` |
| `hr_leave_encashments` | Encashment requests (amount → Payroll) | `employee_id`, `leave_type_id` |

### 2.2 Workflow & approval state transitions
Apply → **pending** → { **approved** | **rejected** | **cancelled** }. On **approved**: a ledger debit (`entry_type='applied'`, −days) posts AND the M2 attendance days stamp on-leave (trigger `092`). Approved→**cancelled**: HR reversal posts +days and the attendance stamp clears. Rejected/cancelled from pending: status only.

### 2.3 Are approval STATES configurable or hardcoded?
- **Request states** (`pending/approved/rejected/cancelled`) are a **fixed lifecycle** (CHECK-constrained) — intentionally hardcoded; these four are the standard, stable states and are not meant to vary per tenant.
- **Approval ROUTING (who approves, how many levels)** is **configurable** via the Administration approval matrix (`HRMS_BUSINESS_RULES` §12). M3 ships **single-level** approval (reporting manager / HR per permission). **Multi-level chains are deferred** — see 2.9.

### 2.4 Holiday handling by location / business unit
`hr_holidays.branch_id → office_locations` → holidays can be **branch/location-scoped** (a null branch = company-wide). **Business-unit scoping is deferred**: the business-unit master isn't built yet (deferred from M1 Foundation). When BU masters land, an additive `business_unit_id` on `hr_holidays` extends this — backward-compatible.

### 2.5 Leave ledger architecture
Append-only **signed-quantity ledger** (`hr_leave_ledger`): credits (`opening/accrual/carry_forward/adjustment`, +) and debits (`applied/encashment/lapse`, −), each with `entry_date`, `ref_type/ref_id`, `note`, and audit. No stored/mutable balance → tamper-evident, fully reconstructable.

### 2.6 Balance calculation strategy
**Derived, real-time** via `get_leave_balance(employee, leave_type, year?)` = `SUM(quantity)` over the ledger. Verified: opening 12 − applied 2 = **10.00**. No stored balance to drift.

### 2.7 Attachment support
`hr_leave_requests.attachment_url` + `document_id` (migration `091`); the Apply-Leave modal captures an attachment link (required-indicator when `hr_leave_types.requires_proof`). File upload via Document Management is a follow-up (URL/link now).

### 2.8 Approval history
Each request carries `approver_id`, `decided_at`, `decision_note`. Full history of every state transition (apply/approve/reject/cancel/reverse) is in the **immutable `audit_log`** (trigger-enforced). A dedicated multi-step approval-history table arrives with multi-level approval (2.9).

### 2.9 Delegation / acting-manager
**Deferred (documented).** Reason: delegation + multi-level approval chains are a **cross-module platform concern** (leave, attendance, expenses, recruitment all need the same engine). Building it once as a shared **approval engine / chain builder** (flagged in M1 tech debt) is correct rather than a leave-only version. Planned: the approval-engine milestone (or folded into a later foundation pass) before Production Readiness. M3 uses single-level approval meanwhile.

### 2.10 Integration points
| With | How |
|---|---|
| **Employee Master (M1)** | every leave row keys `employee_id → profiles`; balances/requests per employee |
| **Attendance (M2)** | trigger `092`: approved leave stamps `hr_attendance_days` on-leave (verified); comp-off (`hr_comp_off`) sources from M2 OT/holiday-work |
| **Payroll (M4, future)** | LWP/unpaid + absent = LOP input; approved leave affects paid days; `hr_leave_encashments.amount` left null for Payroll to compute; F&F reads balances — all read-model seams ready |
| **Notifications** | leave apply/approve/reject events reuse the existing notifications infra (email/WhatsApp/in-app); wiring to triggers is the standard follow-up (like other modules) |

## 3. Verification
- `tsc -b` ✅ · `vite build` ✅ (leave chunks) · `vitest` ✅ **11/11** (added M3 leave permission + route assertions).
- **DB integration** ✅ — Leave↔Attendance sync (approve stamps 2 days, cancel clears); `get_leave_balance` = 10.00 from ledger; audit fires on ledger/requests; RLS self-scope + approver.
- **Backward compatibility** ✅ — frozen M1/M2 schema untouched; trigger only writes M2's data table (intended use); all additive.

## 4. UAT Checklist (staging)
- [ ] **My Leave** — balance cards per type; apply CL (with attachment); half-day; block when balance insufficient (non-LWP).
- [ ] **Approvals** — approve a request → balance drops + the day shows on-leave in Attendance muster; reject with note.
- [ ] **Reverse** — HR cancels an approved leave → balance restored + attendance stamp cleared.
- [ ] **Restricted holiday** — pick within the configured quota.
- [ ] **Leave Setup** — add/edit a leave type; add a holiday (branch-scoped); post an opening balance; approve an encashment.
- [ ] **Attendance Status master** — edit a status label/flag (proves configurability).
- [ ] **Configurability** — change `leave.sandwich`/`holiday.restricted_quota` in HR Settings; saves.
- [ ] **Permissions** — executive sees only own leave; manager approves team; salary/PII still gated.
- [ ] **Reports** — balances + availed + liability render.
- [ ] **Audit** — approvals/reversals appear in the Audit Log.

## 5. Release Notes — HRMS M3 (Leave)
**Added:** Leave Management — configurable leave types, ledger-based balances (`get_leave_balance`), apply/approve/cancel with attachment, restricted-holiday picks, comp-off, encashment; leave↔attendance sync; leave reports. Plus the configurable attendance-status master (enhancement).
**DB:** migrations `090` (schema + status masters), `091` (attachment), `092` (leave↔attendance trigger).
**Compatibility:** additive; frozen M1/M2 untouched; staging only; production untouched.
**Known/deferred:** multi-level approval + delegation (shared approval engine — see 2.9); automated monthly accrual + year-end carry-forward/lapse job (`pg_cron` — manual/HR-driven now); business-unit-scoped holidays (BU master not built); DMS file-upload for attachments (URL now); Notifications trigger wiring (infra ready).

## 6. Recommendation
**Staging-ready, not production-ready** — functionally complete for the leave lifecycle, tested, backward-compatible, secure (RLS + audit + configurable). Awaits your authenticated UAT sign-off; the deferred items (accrual job, multi-level approval, notifications wiring) are expected before production; production go-live is gated behind the platform Production Readiness phase.

## 7. Next milestone
On approval + freeze of M3, proceed to **M4 — Payroll & Statutory**. No progression without explicit approval.
