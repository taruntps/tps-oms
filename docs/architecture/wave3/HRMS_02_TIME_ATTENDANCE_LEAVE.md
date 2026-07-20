# HRMS_02 — Time, Attendance & Leave (Wave 3, Design-Only Specification)

> **STATUS: DESIGN ONLY — NOT IMPLEMENTED.** This document is a specification (FRS / TDS /
> DB spec / UI / Workflow / Permission Matrix / API). It contains **no** executable SQL,
> migrations, React, or API code. Database design is expressed as **markdown tables**
> (columns / types / keys / relationships / indexes / constraints), never as `CREATE TABLE`.
> Implementation begins only after explicit user approval. Wave 1 + Wave 2 are frozen
> (`v2.0-wave2-complete`); production untouched; staging only.

**Parent scope:** `docs/architecture/wave3/00_WAVE3_DESIGN_OVERVIEW.md`
**Module design:** `docs/architecture/modules/hrms.md`
**Module key:** `hrms` · **Timezone:** all wall-clock logic `Asia/Kolkata` (IST) · **Currency:** INR

## 0. Design contract (binding constraints)

| # | Constraint | How this doc honors it |
|---|---|---|
| C1 | **Reuse & extend, never recreate** | `attendance_days` (view), `attendance_punches`, `attendance_settings`, `office_locations`, `employee_details`, `profiles` are reused. New columns are **additive nullable** only. |
| C2 | **Design only** | DB shown as spec tables; no DDL. |
| C3 | **Everything configurable via Administration** | All rules (grace, late, half-day, OT, shifts, weekly-offs, holidays, leave rules, sandwich, accrual) live in config tables / `app_settings` / `feature_flags`; nothing hardcoded. |
| C4 | **Additive / backward-compatible** | Expand-contract; immutable `attendance_punches` never mutated (corrections are separate rows). |
| C5 | **ERP is System of Record** | No duplicate data; muster/LOP derived, not re-keyed. |
| C6 | **Cross-cutting services reused** | Administration (roles/permissions/settings/flags), Notifications (`core/notifications`), Audit Log (append-only), Documents, Reports. |

**Existing objects this doc extends (verified against `supabase/migrations/`):**

| Object | Kind | Existing columns (do NOT recreate) |
|---|---|---|
| `office_locations` | table | `id, name, latitude, longitude, radius_m, is_active, created_at` |
| `attendance_settings` | singleton table | `id (bool guard), expected_start_time, standard_hours, selfie_required, accuracy_threshold_m, updated_at, face_match_required, face_match_threshold` |
| `attendance_punches` | table (immutable) | `id, user_id, punch_at, latitude, longitude, accuracy_m, distance_m, office_id, within_fence, is_field, selfie_path, device_info, created_at, face_matched, face_score, verification_status` |
| `attendance_days` | view (`security_invoker`) | `user_id, work_date, first_in, last_out, punch_count, worked_minutes` |
| `punch_attendance()` | RPC (SECURITY DEFINER) | geofence + accuracy gate + face verify + immutable insert — **reused unchanged** |

---

# PART A — ATTENDANCE

## A.1 Functional Requirements (FRS)

### A.1.1 Attendance capture
- **FR-A01 Biometric / device integration.** Attendance is captured through the existing geofenced punch (mobile web) and, additively, through **external biometric/access-control devices** (fingerprint / RFID / face terminals) via an **import adapter** that pushes device events into the punch trail. Device punches are reconciled, never allowed to bypass the immutable trail.
- **FR-A02 GPS / geofence attendance.** Reuse existing server-side geofence: office staff must be inside an `office_locations` fence (Haversine + `accuracy_threshold_m`); field staff (`profiles.is_field_staff`) bypass the fence and are tagged `is_field`. **Configurable** per office radius and accuracy threshold (Administration).
- **FR-A03 Face verification.** Reuse existing on-device face-match (`face_match_required`, `face_match_threshold`, `verification_status`). Ships per current flag state; enabled only after staff enrol (per project memory).
- **FR-A04 Manual attendance.** HR may record attendance for an employee who could not punch (device failure, no network, outdoor duty) — stored as an **explicit manual entry** attributable to the HR user, never as a fake GPS punch.
- **FR-A05 Self-service punch.** Employee punches In/Out from `/hrms/me/punch`; multiple punches per day supported; daily rollup via `attendance_days`.

### A.1.2 Attendance rules (all configurable — Administration)
- **FR-A06 Grace period.** Configurable grace minutes after `expected_start_time` before a punch is marked **late**.
- **FR-A07 Late arrival.** After grace, mark **late**; configurable policy: N lates in a period = ½-day / 1 LOP deduction.
- **FR-A08 Early exit.** `last_out` earlier than shift end by more than a configurable threshold → **early-exit** flag; configurable half-day / deduction rule.
- **FR-A09 Half-day / min-hours.** Configurable minimum worked-minutes for **full day**, and threshold below which the day is **half-day** or **absent**.
- **FR-A10 Missed punch.** No In or no Out for a working day (and no approved leave / holiday / weekly-off) → **missed-punch exception**; employee raises a regularization request.
- **FR-A11 Overtime (OT).** Worked-minutes beyond `standard_hours` + configurable OT threshold → **OT minutes** captured; OT is **eligibility-flagged per employee/grade** and **rounded/capped** per configurable policy. OT payout/comp-off routing is defined by policy (feeds Payroll or comp-off ledger). No auto-pay in HRMS beyond producing the OT quantum.
- **FR-A12 Outdoor duty (OD) / work-from-field.** Employee logs **OD** for a date/range (client visit, audit, field sampling) with reason; on approval the day is treated as **present (OD)** in the muster even without an in-fence punch. Distinct from leave (paid working day).
- **FR-A13 Shift allocation interplay.** Late/early/half-day/OT are computed against the **allocated shift** for that date (see Part B), not a single global start time, when shift management is enabled.

### A.1.3 Corrections & approvals
- **FR-A14 Attendance-correction (regularization) workflow.** Employee submits a correction for a specific `work_date` (proposed In/Out, category: missed-punch / late-waiver / wrong-punch / OD / manual). Routed to HOD (L1) then HR (L2, configurable levels). On approval a **correction row** materializes; the underlying punch is never edited.
- **FR-A15 Correction window.** Configurable cut-off (e.g. corrections allowed until Nth of next month or until payroll lock), after which the period is frozen.

### A.1.4 Reporting
- **FR-A16 Attendance reports.** Daily register, monthly muster/LOP, late/early exceptions, OT register, OD register, regularization audit, device-sync reconciliation. Filter by department/office/field-office/employee/date; export CSV/XLSX/PDF (via Reports/`core/files`).

## A.2 Technical Design (TDS)

- **Reuse the punch engine as-is.** `punch_attendance()` remains the only insert path for GPS punches; no signature change. Device/manual/OD/correction entries are **new rows in new additive tables**, and the **muster resolver** unions them with `attendance_days`.
- **Derived, not stored, day status.** A `resolve_attendance_day(user, date)` RPC computes the canonical day record: applies allocated shift → grace/late/early → min-hours half-day → OT → overlays approved regularizations, OD, leave, holiday, weekly-off. Output is a **read model** (view/materialized), keeping punches immutable.
- **Config-driven.** Rule values are read from `attendance_rule_sets` / `attendance_settings` (extended) at resolve time; changing a rule re-derives future musters without code change.
- **Immutability & audit.** No UPDATE/DELETE on `attendance_punches`. Every correction/manual/OD/rule change writes `audit_log` (who/what/when/before/after) via shared trigger/helper.
- **Device adapter boundary.** External biometric feed lands via an Edge Function (`ingest_device_punches`) that normalizes vendor payloads → `attendance_device_events` → reconciled into the muster; secrets in Vault (Administration), never in frontend.
- **Timezone.** All day bucketing uses `at time zone 'Asia/Kolkata'` (matches existing `attendance_days`).
- **Feature-flag gating.** `biometric_device_enabled`, `overtime_enabled`, `shift_management_enabled`, `outdoor_duty_enabled` in `feature_flags` (stage/prod split) so staging stays sandboxed.

## A.3 Database Design (specification — additive over existing attendance tables)

### A.3.1 EXTEND `attendance_settings` (additive nullable columns; singleton preserved)

| New column | Type | Default | Purpose / constraint |
|---|---|---|---|
| `grace_minutes` | int | 10 | Minutes after shift start before "late". `>= 0`. |
| `half_day_min_minutes` | int | 240 | Below → half-day. `>= 0`. |
| `full_day_min_minutes` | int | 480 | At/above → full day. `>= half_day_min_minutes` (app-checked). |
| `early_exit_grace_minutes` | int | 10 | Before shift end tolerated. `>= 0`. |
| `ot_threshold_minutes` | int | 30 | Worked beyond standard+threshold counts as OT. `>= 0`. |
| `ot_rounding_minutes` | int | 15 | OT rounded down to nearest N. |
| `late_to_halfday_count` | int | 3 | N lates in period → ½-day deduction (0 = disabled). |
| `correction_cutoff_day` | int | 5 | Regularization allowed until Nth of following month. `1..28`. |
| `manual_entry_allowed` | bool | true | Master toggle for HR manual attendance. |

> These extend the existing 8 columns; they do not alter `expected_start_time`, `standard_hours`, `selfie_required`, `accuracy_threshold_m`, `face_match_required`, `face_match_threshold`.

### A.3.2 EXTEND `attendance_punches` (additive nullable columns only)

| New column | Type | Default | Purpose |
|---|---|---|---|
| `source` | text (enum-like) | `'gps'` | `gps` (existing RPC), `device`, `manual`. Check-constrained. |
| `device_event_id` | uuid (FK → `attendance_device_events.id`) | null | Provenance for imported device punches. |
| `entered_by` | uuid (FK → `profiles.id`) | null | Set for `manual` source (attribution). |
| `punch_kind` | text | null | `in` / `out` (optional hint; rollup still uses min/max). |

> Existing columns and immutability are unchanged. `source` defaults to `gps` so all historic rows remain valid.

### A.3.3 NEW `attendance_device_events` (raw biometric/access-control ingest)

| Column | Type | Key / constraint | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `device_id` | text | not null | Terminal identifier |
| `external_user_ref` | text | not null | Vendor employee code (mapped to `profiles` via `employee_code`) |
| `user_id` | uuid | FK → `profiles.id`, nullable | Resolved after mapping |
| `event_at` | timestamptz | not null | Device timestamp (converted to IST on resolve) |
| `event_type` | text | check `in`/`out`/`unknown` | |
| `raw_payload` | jsonb | not null | Original vendor record (audit) |
| `status` | text | check `pending`/`reconciled`/`ignored`/`error` | |
| `reconciled_punch_id` | uuid | FK → `attendance_punches.id`, nullable | Link to materialized punch |
| `created_at` | timestamptz | default now() | |
| Indexes | | `(device_id, event_at)`, `(status)`, `(external_user_ref)` | |

### A.3.4 NEW `attendance_regularizations` (correction requests — extends the seam named in hrms.md)

| Column | Type | Key / constraint | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `user_id` | uuid | FK → `profiles.id`, not null | Requester |
| `work_date` | date | not null | Day being corrected |
| `category` | text | check `missed_punch`/`wrong_punch`/`late_waiver`/`early_waiver`/`manual`/`od` | |
| `proposed_in` | timetz / timestamptz | nullable | Requested In |
| `proposed_out` | timetz / timestamptz | nullable | Requested Out |
| `reason` | text | not null | |
| `attachment_path` | text | nullable | Optional proof (Storage) |
| `status` | text (`regularization_status`) | check `pending`/`hod_approved`/`approved`/`rejected`/`cancelled` | Multi-level |
| `hod_approver` | uuid | FK → `profiles.id`, nullable | L1 |
| `hr_approver` | uuid | FK → `profiles.id`, nullable | L2 |
| `decided_at` | timestamptz | nullable | |
| `created_at` | timestamptz | default now() | |
| Constraints | | Unique `(user_id, work_date, category)` while status in (pending, hod_approved) — prevents duplicates | |
| Indexes | | `(status)`, `(user_id, work_date)`, `(hod_approver)` | |

### A.3.5 NEW `attendance_corrections` (materialized approved correction — never edits a punch)

| Column | Type | Key / constraint | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `user_id` | uuid | FK → `profiles.id`, not null | |
| `work_date` | date | not null | |
| `effective_in` | timestamptz | nullable | Overrides derived first_in |
| `effective_out` | timestamptz | nullable | Overrides derived last_out |
| `day_status_override` | text | nullable | `present`/`half_day`/`od`/`present_manual` |
| `regularization_id` | uuid | FK → `attendance_regularizations.id` | Source request |
| `approved_by` | uuid | FK → `profiles.id` | |
| `created_at` | timestamptz | default now() | |
| Constraints | | Unique `(user_id, work_date)` (one active override per day) | |

### A.3.6 NEW `outdoor_duty_requests` (OD / field work)

| Column | Type | Key / constraint | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `user_id` | uuid | FK → `profiles.id`, not null | |
| `from_date` / `to_date` | date | not null, `to_date >= from_date` | |
| `half_day` | bool | default false | |
| `purpose` | text | not null | Client/audit/sampling |
| `client_ref` | uuid | nullable | Optional link to CRM/project (loose) |
| `status` | text | check `pending`/`approved`/`rejected`/`cancelled` | |
| `approver` | uuid | FK → `profiles.id`, nullable | |
| `created_at` | timestamptz | default now() | |
| Indexes | | `(user_id, from_date)`, `(status)` | |

### A.3.7 NEW `attendance_overtime` (derived OT quantum — feeds Payroll/comp-off)

| Column | Type | Key / constraint | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `user_id` | uuid | FK → `profiles.id`, not null | |
| `work_date` | date | not null | |
| `ot_minutes` | int | not null, `>= 0` | Post-rounding, post-cap |
| `ot_eligible` | bool | default false | From employee/grade policy |
| `disposition` | text | check `unpaid`/`payroll`/`comp_off` | Routing decision |
| `approved_by` | uuid | FK → `profiles.id`, nullable | OT often needs approval |
| `payroll_run_id` | uuid | nullable | Set when consumed by Payroll |
| Constraints | | Unique `(user_id, work_date)` | |

### A.3.8 Audit / RLS intent

| Table | Select | Insert / Update / Delete |
|---|---|---|
| `attendance_device_events` | `super_admin/director/hr` | Edge Function (service role) only |
| `attendance_regularizations` | own OR `hr/director/manager (team)` | insert: self; transitions via RPC (HOD/HR) |
| `attendance_corrections` | own OR `hr/director/manager` | RPC only (SECURITY DEFINER) |
| `outdoor_duty_requests` | own OR `hr/director/manager (team)` | insert: self; approve via RPC |
| `attendance_overtime` | own OR `hr/director` | RPC/cron only |
| `attendance_punches` (existing) | own OR `super_admin/director/hr/manager` | insert via `punch_attendance()` / device Edge Fn only; **no update/delete** |

All state tables carry an `audit_log` trigger (who/what/when/before/after).

## A.4 UI Design

**Menu (under `/hrms`):** Attendance → *Board*, *Regularizations*, *Outdoor Duty*, *Overtime*, *Device Sync* (admin), *Reports*. Self-service under `/hrms/me`.

| Route | Screen | Who | Key elements |
|---|---|---|---|
| `/hrms/attendance` | Attendance Board | HR, manager (team) | Monthly **calendar/muster grid** (P/A/WO/H/L/OD/½), late & early chips, filters (dept/office/field), day drill-in |
| `/hrms/attendance/regularizations` | Regularization Queue | HOD, HR | Pending list, approve/reject with note, category badges |
| `/hrms/attendance/outdoor-duty` | OD Queue | HOD, HR | Approve OD; calendar overlay |
| `/hrms/attendance/overtime` | OT Register | HR, director | OT minutes per employee/day, disposition select, approve |
| `/hrms/attendance/device-sync` | Device Sync | super_admin, HR | Reconciliation table (pending/error), map external ref → employee, re-run import |
| `/hrms/attendance/manual` | Manual Entry (modal/form) | HR | Employee + date + In/Out + reason (attribution captured) |
| `/hrms/me/punch` | Punch (existing) | all | Geofenced/face In-Out (existing engine, unchanged) |
| `/hrms/me/attendance` | My Attendance | all | My month calendar, worked hrs, raise **regularization**/**OD**, view lates |

**Forms:** Regularization (date, category, proposed In/Out, reason, attachment); OD (date range, half-day, purpose, client_ref); Manual (employee, date, In/Out, reason); Device mapping (external_ref → employee_code).
**Calendar views:** colour legend P/A/WO/Holiday/Leave/OD/Half; hover shows first_in/last_out/worked minutes/late/OT.
**Empty/edge states:** no office fence set → banner to Administration; face not enrolled → prompt; correction window closed → disabled with tooltip.

## A.5 Workflow Design

**A.5.1 Attendance-correction (regularization) flow**
1. Employee opens *My Attendance* → selects an exception day (missed/late/wrong punch).
2. Submits regularization (`request_regularization`): category + proposed In/Out + reason (+attachment). Guard: within `correction_cutoff_day`; no duplicate open request for same day/category. Status → `pending`.
3. Notify HOD (`regularization_requested`).
4. **L1 — HOD decides** (`decide_regularization`, level=hod): approve → `hod_approved`; reject → `rejected` (notify employee).
5. **L2 — HR decides** (level=hr): approve → `approved` → RPC writes `attendance_corrections` (override row) + recomputes that day's read model; reject → `rejected`.
6. Notify employee (`regularization_decided`); `audit_log` written at each transition.
7. If period is locked (payroll approved) → request blocked with message to raise adjustment next cycle.

**A.5.2 Outdoor-duty flow**
1. Employee submits OD (range, purpose). Status `pending` → notify HOD.
2. HOD/HR approves → day(s) resolve as **present (OD)** in muster (no in-fence punch needed). Reject → `rejected`. Cancellable before start.

**A.5.3 Overtime flow**
1. Nightly resolver computes `ot_minutes` for eligible employees (worked beyond standard + `ot_threshold_minutes`, rounded).
2. HR/director reviews OT register, sets `disposition` (`unpaid`/`payroll`/`comp_off`) and approves.
3. `comp_off` → credits comp-off leave ledger (Part C). `payroll` → tagged for the month's run (Payroll doc consumes it).

**A.5.4 Device-sync flow**
1. Edge Function `ingest_device_punches` receives vendor batch → rows into `attendance_device_events` (`pending`).
2. Reconciler maps `external_user_ref` → `profiles.employee_code`; on match, materializes an `attendance_punches` row (`source='device'`, `device_event_id` set) → event `reconciled`. Unmapped → `error` (surface in Device Sync screen).

## A.6 Permission Matrix (Attendance)

Namespace `hrms.attendance.*`. RLS is authoritative; `useCan()` is affordance only.

| Permission key | super_admin | director | hr | manager (HOD) | accounts | auditor |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `hrms.attendance.view` | ✓ all | ✓ all | ✓ all | team | — | read |
| `hrms.attendance.view.self` | self | self | self | self | self | self |
| `hrms.attendance.punch` | self | self | self | self | self | self |
| `hrms.attendance.manage` (settings/rules via Admin) | ✓ | ✓ | ✓ | — | — | — |
| `hrms.attendance.correct.request` | self | self | self | self | self | self |
| `hrms.attendance.correct.approve.hod` | ✓ | ✓ | ✓ | team | — | — |
| `hrms.attendance.correct.approve.hr` | ✓ | ✓ | ✓ | — | — | — |
| `hrms.attendance.manual.enter` | ✓ | ✓ | ✓ | — | — | — |
| `hrms.attendance.od.request` | self | self | self | self | self | self |
| `hrms.attendance.od.approve` | ✓ | ✓ | ✓ | team | — | — |
| `hrms.attendance.overtime.manage` | ✓ | ✓ | ✓ | — | — | — |
| `hrms.attendance.device.manage` | ✓ | — | ✓ | — | — | — |
| `hrms.attendance.report` | ✓ | ✓ | ✓ | team | — | read |

"team" = HOD scope via `is_hod_of(target_user)` (matches `profiles.department`/`hod_email`).

## A.7 API Design (described — thin wrappers + SECURITY DEFINER RPCs)

**Data-access (`modules/hrms/api/attendance.ts`)**

| Function | Inputs | Output | Authz |
|---|---|---|---|
| `getAttendanceMonth(userId, year, month)` | scope | day read-model[] | self / `attendance.view` (team-scoped) |
| `getTeamMuster(filter)` | dept/office/date range | muster grid | `attendance.view` |
| `listRegularizations(filter)` | scope, status | request[] | scoped by role |
| `listOutdoorDuty(filter)` | scope, status | OD[] | scoped |
| `getOvertimeRegister(year, month)` | period | OT[] | `attendance.overtime.manage` |
| `listDeviceEvents(status)` | status | event[] | `attendance.device.manage` |

**RPCs / Edge Functions**

| Name | Kind | Inputs | Output | Authz enforced in fn |
|---|---|---|---|---|
| `punch_attendance` (existing, reused) | RPC (definer) | lat,lng,accuracy,selfie,device | punch result | authenticated |
| `request_regularization` | RPC (definer) | work_date, category, in, out, reason, attachment | request row | self; window + dup guard |
| `decide_regularization` | RPC (definer) | id, decision, level | request row | HOD (L1) / HR (L2); writes `attendance_corrections` atomically on final approve |
| `enter_manual_attendance` | RPC (definer) | user_id, work_date, in, out, reason | correction/punch row | `attendance.manual.enter`; sets `source='manual'`, `entered_by` |
| `request_outdoor_duty` | RPC (definer) | from,to,half_day,purpose | OD row | self |
| `decide_outdoor_duty` | RPC (definer) | id, decision | OD row | HOD/HR |
| `resolve_attendance_day` | RPC (definer) | user_id, work_date | day read-model | internal/HR; applies shift+rules+overlays |
| `compute_overtime` | RPC/cron (definer) | year, month | count | cron/HR; writes `attendance_overtime` |
| `set_overtime_disposition` | RPC (definer) | id, disposition | OT row | `attendance.overtime.manage`; comp_off → credits leave ledger |
| `ingest_device_punches` | Edge Function | vendor batch | reconcile summary | service role (Vault secret) |

All async wrapped in try/catch; user errors via `toast()`; every state change writes `audit_log`. Payroll interface: `attendance_overtime` (disposition=`payroll`) and monthly muster LOP are **read by the Payroll doc** — see Part C.4 / HRMS_03.

---

# PART B — SHIFT MANAGEMENT

## B.1 Functional Requirements (FRS)

- **FR-B01 Shift definitions (configurable).** Define named shifts (General, Early, Late, Night, Half) with start/end time, break minutes, standard/half-day minutes, cross-midnight flag, grace overrides, and OT rule ref. All values editable via Administration — no hardcoded 09:30.
- **FR-B02 Weekly-off patterns (configurable).** Define weekly-off templates (e.g. Sun off; alternate-Saturday off; 2nd & 4th Sat off; 5-day week). Attach a pattern to a shift or directly to an employee/department.
- **FR-B03 Shift rotation.** Define rotation schemes (fixed, weekly-rotating, N-day cycle) that auto-assign shifts to a roster group over time; regenerate roster forward without touching past dates.
- **FR-B04 Shift allocation.** Assign a shift (or rotation) to an employee/department/office for a date range; overrides for a single date (swap, cover). Effective-dated; latest active assignment wins for a given date.
- **FR-B05 Holiday interaction.** Holidays (from Part C holiday calendar) and weekly-offs suppress "absent"/late computation. Optional/restricted holidays interact with leave (Part C). A shift's working-day set = calendar days − weekly-offs − holidays.
- **FR-B06 Shift-aware attendance.** Late/early/half-day/OT (Part A) evaluate against the **allocated shift for that date**, falling back to `attendance_settings` when shift management is disabled (`shift_management_enabled=false`).
- **FR-B07 Night / cross-midnight shifts.** A shift crossing midnight buckets worked-minutes to the shift's business date, not the calendar date, via a configurable "shift day boundary".
- **FR-B08 Roster views & reports.** Roster calendar per team/employee; coverage report; shift-change audit.

## B.2 Technical Design (TDS)

- **Config-first.** Shifts, weekly-off patterns, rotations and holidays are **data** in config tables managed in Administration; the resolver reads them at muster time. Nothing about timings is compiled in.
- **Resolution order for a `(user, date)`:** (1) explicit date override → (2) active rotation assignment → (3) active fixed shift assignment (employee → department → office → org default) → (4) `attendance_settings` fallback. First hit wins; the chosen shift + weekly-off pattern feed `resolve_attendance_day` (Part A).
- **Weekly-off & holiday overlay.** Pattern yields the set of non-working weekdays; holiday calendar yields dated non-working days; union marks the day WO/H so no late/absent is raised.
- **Rotation generation.** A generator RPC materializes `shift_roster` rows for a forward window (e.g. next 90 days) from a rotation definition; idempotent per (user, date); never rewrites locked/past periods.
- **Backward-compatible default.** With `shift_management_enabled=false`, everyone is on an implicit "General" shift derived from `attendance_settings` — existing behavior preserved exactly.

## B.3 Database Design (specification)

### B.3.1 NEW `shifts`

| Column | Type | Key / constraint | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `code` | text | unique, not null | `GEN`/`EARLY`/`NIGHT`/`HALF` |
| `name` | text | not null | |
| `start_time` | time | not null | |
| `end_time` | time | not null | |
| `crosses_midnight` | bool | default false | Night shift |
| `break_minutes` | int | default 0, `>= 0` | |
| `full_day_min_minutes` | int | nullable | Override of settings default |
| `half_day_min_minutes` | int | nullable | Override |
| `grace_minutes` | int | nullable | Override |
| `ot_rule` | text | nullable | Ref to OT policy |
| `is_active` | bool | default true | |
| Indexes | | `(code)`, `(is_active)` | |

### B.3.2 NEW `weekly_off_patterns` + `weekly_off_pattern_days`

`weekly_off_patterns`

| Column | Type | Key | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `code` | text | unique | `SUN_OFF`/`ALT_SAT`/`5DAY` |
| `name` | text | not null | |
| `rule_json` | jsonb | not null | Encodes weekday offs + nth-week logic (e.g. `{sun:true, sat:[2,4]}`) |
| `is_active` | bool | default true | |

`weekly_off_pattern_days` (optional normalized expansion for query speed)

| Column | Type | Key | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `pattern_id` | uuid | FK → `weekly_off_patterns.id` | |
| `weekday` | int | check `0..6` | 0=Sun (IST) |
| `nth_weeks` | int[] | nullable | e.g. `{2,4}` for alt-Saturday; null = every |

### B.3.3 NEW `shift_rotations` + `shift_rotation_steps`

`shift_rotations`

| Column | Type | Key | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `code` | text | unique | |
| `name` | text | not null | |
| `cycle_days` | int | `>= 1` | Rotation length |
| `weekly_off_pattern_id` | uuid | FK → `weekly_off_patterns.id`, nullable | |
| `is_active` | bool | default true | |

`shift_rotation_steps`

| Column | Type | Key | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `rotation_id` | uuid | FK → `shift_rotations.id` | |
| `day_index` | int | `0..cycle_days-1` | Position in cycle |
| `shift_id` | uuid | FK → `shifts.id` | Shift for that step |
| Constraints | | Unique `(rotation_id, day_index)` | |

### B.3.4 NEW `shift_assignments` (effective-dated allocation)

| Column | Type | Key / constraint | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `scope` | text | check `employee`/`department`/`office`/`org` | Allocation level |
| `user_id` | uuid | FK → `profiles.id`, nullable | For `employee` scope |
| `department` | text | nullable | For `department` scope |
| `office_id` | uuid | FK → `office_locations.id`, nullable | For `office` scope |
| `shift_id` | uuid | FK → `shifts.id`, nullable | Fixed shift (mutually exclusive with rotation) |
| `rotation_id` | uuid | FK → `shift_rotations.id`, nullable | Rotating |
| `weekly_off_pattern_id` | uuid | FK → `weekly_off_patterns.id`, nullable | Overrides shift/rotation pattern |
| `effective_from` | date | not null | |
| `effective_to` | date | nullable (null = current) | |
| `is_active` | bool | default true | |
| Constraints | | Exactly one of `shift_id`/`rotation_id` set (app-checked); no overlapping active ranges per same-scope key | |
| Indexes | | `(user_id, effective_from)`, `(department)`, `(office_id)`, `(scope, is_active)` | |

### B.3.5 NEW `shift_roster` (materialized per-day assignment; supports swaps/overrides)

| Column | Type | Key / constraint | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `user_id` | uuid | FK → `profiles.id`, not null | |
| `work_date` | date | not null | |
| `shift_id` | uuid | FK → `shifts.id`, not null | Resolved shift for the day |
| `is_weekly_off` | bool | default false | |
| `source` | text | check `rotation`/`assignment`/`override`/`default` | Provenance |
| `override_reason` | text | nullable | Swap/cover note |
| `created_by` | uuid | FK → `profiles.id`, nullable | For manual overrides |
| Constraints | | Unique `(user_id, work_date)` | |
| Indexes | | `(work_date)`, `(user_id, work_date)` | |

### B.3.6 RLS intent

| Table | Select | Insert/Update/Delete |
|---|---|---|
| `shifts`, `weekly_off_patterns*`, `shift_rotations*` | any authenticated (read) | `super_admin/director/hr` |
| `shift_assignments` | own OR `hr/director/manager (team)` | `super_admin/director/hr` |
| `shift_roster` | own OR `hr/director/manager (team)` | RPC/generator (definer); manual override via `hrms.shift.roster.manage` |

All shift/roster changes write `audit_log`.

## B.4 UI Design

**Menu:** `/hrms/shifts` → *Shifts*, *Weekly-Off Patterns*, *Rotations*, *Allocation*, *Roster*.

| Route | Screen | Who | Elements |
|---|---|---|---|
| `/hrms/shifts` | Shift definitions | HR, director | Grid of shifts; create/edit (times, breaks, cross-midnight, overrides) |
| `/hrms/shifts/weekly-offs` | Weekly-off patterns | HR | Pattern builder (weekday checkboxes + nth-week for Sat) |
| `/hrms/shifts/rotations` | Rotations | HR | Cycle builder (day-index → shift), attach weekly-off pattern |
| `/hrms/shifts/allocation` | Allocation | HR | Assign shift/rotation to employee/dept/office with date range; single-date override/swap |
| `/hrms/shifts/roster` | Roster calendar | HR, manager (team) | Month grid per team; colour per shift; WO shaded; swap action |
| `/hrms/me/roster` | My roster | all | My upcoming shifts + weekly-offs |

Configuration lives in Administration (`/admin/settings` → HR → Shifts) for org defaults & feature flag `shift_management_enabled`.

## B.5 Workflow Design

**B.5.1 Define & allocate**
1. HR creates shifts + weekly-off patterns (Administration/HR).
2. HR creates a rotation (optional) mapping cycle days → shifts.
3. HR allocates a shift or rotation to employee/dept/office with `effective_from`/`to`.
4. Generator RPC (`generate_shift_roster`) materializes `shift_roster` forward → roster visible.

**B.5.2 Shift swap / override**
1. HR (or manager, if permitted) opens roster → selects a date cell → chooses override shift or marks WO/working, with reason.
2. Writes an `override` `shift_roster` row (unique per user/date) → muster resolver uses it. `audit_log` records the swap.

**B.5.3 Resolver interaction (feeds Part A)**
For each `(user, date)`, `resolve_attendance_day` fetches `shift_roster` → shift times + WO flag → applies grace/late/early/half-day/OT and holiday/WO suppression. Fallback to `attendance_settings` if no roster row and shift management is off.

## B.6 Permission Matrix (Shift)

| Permission key | super_admin | director | hr | manager (HOD) | auditor |
|---|:--:|:--:|:--:|:--:|:--:|
| `hrms.shift.view` | ✓ | ✓ | ✓ | team | read |
| `hrms.shift.manage` (shifts/patterns/rotations) | ✓ | ✓ | ✓ | — | — |
| `hrms.shift.allocate` | ✓ | ✓ | ✓ | — | — |
| `hrms.shift.roster.view` | ✓ | ✓ | ✓ | team | read |
| `hrms.shift.roster.manage` (swap/override) | ✓ | ✓ | ✓ | team (if enabled) | — |

## B.7 API Design (described)

**Data-access (`modules/hrms/api/shifts.ts`)**

| Function | Inputs | Output | Authz |
|---|---|---|---|
| `listShifts()` / `listWeeklyOffPatterns()` / `listRotations()` | — | config[] | `shift.view` |
| `listShiftAssignments(filter)` | scope, active | assignment[] | `shift.view` |
| `getRoster(scope, from, to)` | team/user, range | roster[] | `shift.roster.view` |
| `getMyRoster(from, to)` | range | roster[] | self |

**RPCs**

| Name | Kind | Inputs | Output | Authz |
|---|---|---|---|---|
| `upsert_shift` / `upsert_weekly_off_pattern` / `upsert_rotation` | RPC (definer) | config payload | row | `shift.manage` |
| `assign_shift` | RPC (definer) | scope, target, shift/rotation, dates | assignment | `shift.allocate`; overlap guard |
| `generate_shift_roster` | RPC/cron (definer) | scope, window | count | `shift.allocate`/cron; idempotent, forward-only |
| `override_roster_day` | RPC (definer) | user_id, date, shift_id/WO, reason | roster row | `shift.roster.manage` |

Feature-flag `shift_management_enabled` (stage/prod) gates the whole surface; when off, resolver uses `attendance_settings` and screens are hidden.

---

# PART C — LEAVE MANAGEMENT

## C.1 Functional Requirements (FRS)

- **FR-C01 Leave types (configurable).** CRUD leave types (CL, SL, EL/PL, LWP, Comp-Off, Maternity, Paternity, Bereavement, Restricted-Holiday) with attributes: paid/unpaid, annual quota, accrual method, carry-forward + cap, encashable, half-day allowed, min/max per request, notice days, doc-required-above-N-days, gender/eligibility filter, sandwich-applicable. Nothing hardcoded; new types are inserts.
- **FR-C02 Leave balance.** Per employee/type/year balance = allocated + carried_forward + accrued − used − pending-hold. Real-time; visible in self-service.
- **FR-C03 Accrual.** Configurable accrual: upfront annual, monthly, or per-quarter, pro-rated on join/exit date. Accrual engine runs on schedule (Administration-configured cadence).
- **FR-C04 Carry-forward.** At year-end, carry unused up to `carry_forward_cap`; lapse the excess. Configurable per type (e.g. EL carries, CL/SL lapse).
- **FR-C05 Encashment.** Encashable types (typically EL) can be encashed at year-end or Full & Final; produces an **encashment quantum** handed to Payroll (never paid by HRMS).
- **FR-C06 Comp-off.** Approved OT/holiday/weekend work credits comp-off (from Part A `attendance_overtime` disposition=`comp_off` or explicit grant); comp-off has a configurable **expiry window**; consumed like leave.
- **FR-C07 Holiday calendar.** Yearly holiday calendar (fixed + optional/restricted), office-scoped (nullable `office_id` for multi-office/state). Drives attendance suppression (Part B) and sandwich rule.
- **FR-C08 Restricted holidays (RH).** Employee may avail a configurable number of RH per year from an optional-holiday pool; applied via a leave request against an RH-type.
- **FR-C09 Sandwich rule (configurable).** If enabled, intervening weekly-offs/holidays between two leave days are counted as leave (e.g. Fri+Mon leave counts Sat/Sun). Toggle per type; configurable variant (full sandwich / only if both sides leave).
- **FR-C10 Multi-level approval workflow.** Configurable approval chain (employee → HOD (L1) → HR (L2) [→ Director for long leave]); each level approve/reject with comment; balance held on submit, debited on final approve.
- **FR-C11 Validation.** On apply: sufficient balance, no overlap with existing/pending leave, notice-days met, max-consecutive respected, doc attached if required. Half-day support.
- **FR-C12 Cancellation / withdrawal.** Before start (or before final approve) → credit back held/debited balance; after start → HR-adjusted.
- **FR-C13 Leave reports.** Balance register, transactions/ledger, leave calendar (team), pending-approvals aging, encashment statement, comp-off register, LOP feed to Payroll.

## C.2 Technical Design (TDS)

- **Ledger-based balances.** `leave_ledger` is the append-only source of truth (credits: allocation/accrual/carry-forward/comp-off/cancellation; debits: approved leave/encashment/lapse). `leave_balances` is a **derived cache** per (user, type, year) rebuilt from the ledger — no double-book.
- **Hold on submit.** Applying places a *pending hold* (soft reservation) so balance can't be double-spent by overlapping requests; final approve converts hold → debit; reject/cancel releases it.
- **Config-driven rules.** Accrual cadence, carry cap, sandwich, notice days, approval levels are read from `leave_types` + `leave_policy` config at run time; the same request path serves all types.
- **Day computation.** Requested days = calendar span − weekly-offs − holidays (unless sandwich rule active for the type), with half-day = 0.5. Uses Part B roster/holiday overlay for accuracy.
- **Atomic transitions via SECURITY DEFINER RPCs** so RLS + invariants (no negative paid balance) can't be bypassed; balance guard trigger on `leave_ledger`.
- **Payroll interface.** Approved LWP/LOP days and unpaid-leave days are exposed to Payroll as the monthly **LOP feed**; encashment and comp-off-lapse quanta are exposed as line inputs — Payroll (HRMS_03) consumes; HRMS never disburses.

## C.3 Database Design (specification)

> Reuses/aligns with the seams already named in `hrms.md` (`leave_types`, `leave_balances`, `leave_requests`, `leave_ledger`, `holidays`) and adds config/approval/comp-off tables. All new tables RLS-on.

### C.3.1 NEW `leave_types` (configurable master)

| Column | Type | Key / constraint | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `code` | text | unique, not null | `CL/SL/EL/LWP/COMP_OFF/MAT/PAT/BEREAVE/RH` |
| `name` | text | not null | |
| `is_paid` | bool | default true | |
| `default_annual_qty` | numeric | `>= 0` | Upfront quota |
| `accrual_method` | text | check `upfront`/`monthly`/`quarterly`/`none` | |
| `accrual_rate` | numeric | nullable | Per-period units |
| `carry_forward` | bool | default false | |
| `carry_forward_cap` | numeric | nullable | Max carried |
| `is_encashable` | bool | default false | |
| `half_day_allowed` | bool | default true | |
| `min_days_per_request` | numeric | nullable | |
| `max_days_per_request` | numeric | nullable | |
| `notice_days` | int | default 0 | Advance notice |
| `doc_required_above_days` | int | nullable | Attachment threshold |
| `gender_filter` | text | nullable | `male`/`female`/null (Mat/Pat) |
| `sandwich_applicable` | bool | default false | |
| `approval_levels` | int | default 2 | Chain length |
| `is_active` | bool | default true | |
| Indexes | | `(code)`, `(is_active)` | |

### C.3.2 NEW `leave_policy` (optional org/grade overrides — keeps rules configurable per group)

| Column | Type | Key | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `leave_type_id` | uuid | FK → `leave_types.id` | |
| `scope` | text | check `org`/`department`/`grade`/`employment_type` | |
| `scope_key` | text | nullable | e.g. dept name / grade code |
| `override_json` | jsonb | not null | Overridden attributes (quota, cap, notice…) |
| `effective_from` | date | not null | |
| Constraints | | Unique `(leave_type_id, scope, scope_key, effective_from)` | |

### C.3.3 NEW `leave_balances` (derived cache)

| Column | Type | Key / constraint | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `user_id` | uuid | FK → `profiles.id` | |
| `leave_type_id` | uuid | FK → `leave_types.id` | |
| `year` | int | not null | FY year |
| `allocated` | numeric | default 0 | Upfront |
| `accrued` | numeric | default 0 | Sum of accruals |
| `carried_forward` | numeric | default 0 | From prior year |
| `used` | numeric | default 0 | Approved debits |
| `pending` | numeric | default 0 | Held (not yet approved) |
| `balance` | numeric | generated/derived | `allocated+accrued+carried_forward-used-pending` |
| Constraints | | Unique `(user_id, leave_type_id, year)` | |
| Indexes | | `(user_id, year)` | |

### C.3.4 NEW `leave_ledger` (append-only source of truth)

| Column | Type | Key / constraint | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `user_id` | uuid | FK → `profiles.id` | |
| `leave_type_id` | uuid | FK → `leave_types.id` | |
| `year` | int | not null | |
| `request_id` | uuid | FK → `leave_requests.id`, nullable | For request-driven entries |
| `entry_type` | text | check `allocation`/`accrual`/`carry_forward`/`comp_off_credit`/`debit`/`cancel_credit`/`lapse`/`encashment` | |
| `delta` | numeric | not null | debit − / credit + |
| `note` | text | nullable | |
| `created_by` | uuid | FK → `profiles.id`, nullable | null = system/cron |
| `created_at` | timestamptz | default now() | |
| Indexes | | `(user_id, leave_type_id, year)`, `(request_id)` | |
| Trigger | | Balance guard: block if resulting paid balance < 0 (except LWP) | |

### C.3.5 NEW `leave_requests`

| Column | Type | Key / constraint | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `user_id` | uuid | FK → `profiles.id` | |
| `leave_type_id` | uuid | FK → `leave_types.id` | |
| `from_date` / `to_date` | date | not null, `to_date >= from_date` | |
| `half_day` | bool | default false | |
| `half_day_slot` | text | nullable | `first`/`second` |
| `days` | numeric | not null, `> 0` | Computed (sandwich/WO/holiday aware) |
| `reason` | text | not null | |
| `attachment_path` | text | nullable | Proof if required |
| `status` | text (`leave_request_status`) | check `pending`/`hod_approved`/`approved`/`rejected`/`cancelled` | |
| `current_level` | int | default 1 | Approval pointer |
| `hod_approver` | uuid | FK → `profiles.id`, nullable | |
| `hr_approver` | uuid | FK → `profiles.id`, nullable | |
| `director_approver` | uuid | FK → `profiles.id`, nullable | Long-leave L3 |
| `created_at` | timestamptz | default now() | |
| Constraints | | No overlap with existing non-cancelled request for same user (app/RPC-checked) | |
| Indexes | | `(user_id, status)`, `(status)`, `(hod_approver)`, `(from_date, to_date)` | |

### C.3.6 NEW `leave_approvals` (per-level audit of the chain)

| Column | Type | Key | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `request_id` | uuid | FK → `leave_requests.id` | |
| `level` | int | not null | 1=HOD, 2=HR, 3=Director |
| `approver` | uuid | FK → `profiles.id` | |
| `decision` | text | check `approved`/`rejected` | |
| `comment` | text | nullable | |
| `decided_at` | timestamptz | default now() | |
| Constraints | | Unique `(request_id, level)` | |

### C.3.7 NEW `holidays` (calendar; office/state-scoped)

| Column | Type | Key / constraint | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `holiday_date` | date | not null | |
| `name` | text | not null | |
| `is_optional` | bool | default false | Restricted holiday pool |
| `office_id` | uuid | FK → `office_locations.id`, nullable | null = all offices |
| `state` | text | nullable | For multi-state PT/holiday |
| `year` | int | not null | |
| Constraints | | Unique `(holiday_date, coalesce(office_id))` | |
| Indexes | | `(year)`, `(office_id)` | |

### C.3.8 NEW `restricted_holiday_grants` (RH availed tracking)

| Column | Type | Key | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `user_id` | uuid | FK → `profiles.id` | |
| `year` | int | not null | |
| `holiday_id` | uuid | FK → `holidays.id` (optional) | Chosen RH |
| `request_id` | uuid | FK → `leave_requests.id`, nullable | Linked RH request |
| Constraints | | Per-year RH cap enforced in RPC | |

### C.3.9 NEW `comp_off_credits` (grants + expiry)

| Column | Type | Key / constraint | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `user_id` | uuid | FK → `profiles.id` | |
| `earned_on` | date | not null | Worked date |
| `source` | text | check `overtime`/`holiday_work`/`manual_grant` | |
| `overtime_id` | uuid | FK → `attendance_overtime.id`, nullable | Provenance from Part A |
| `days` | numeric | `> 0` | Usually 0.5/1 |
| `expires_on` | date | not null | Configurable window |
| `status` | text | check `active`/`consumed`/`expired` | |
| `ledger_id` | uuid | FK → `leave_ledger.id`, nullable | Credit entry |
| Indexes | | `(user_id, status)`, `(expires_on)` | |

### C.3.10 RLS intent

| Table | Select | Insert/Update/Delete |
|---|---|---|
| `leave_types`, `leave_policy`, `holidays` | any authenticated (read) | `super_admin/director/hr` |
| `leave_balances`, `leave_ledger` | own OR `hr/director` | RPC/cron only (definer) |
| `leave_requests` | own OR `hr/director` OR HOD-of-dept | insert: self; transitions via `decide_leave` RPC |
| `leave_approvals` | own request OR `hr/director/manager` | RPC only |
| `restricted_holiday_grants`, `comp_off_credits` | own OR `hr/director` | RPC/cron only |

All leave state changes write `audit_log`.

## C.4 Payroll interface (LOP, comp-off, encashment) — boundary only

> Detailed payroll logic lives in **HRMS_03_PAYROLL_STATUTORY.md**. This doc only defines the **read interfaces** HRMS Payroll consumes:

| Interface (read model / RPC) | Produced by | Consumed by Payroll for |
|---|---|---|
| `get_lop_days(user_id, year, month)` | muster resolver (Part A) + approved unpaid `leave_requests` (LWP) | Salary proration (LOP days) |
| `get_encashment_quantum(user_id, as_of)` | `leave_ledger` (encashable EL balance) | Year-end / F&F EL encashment line |
| `attendance_overtime` where `disposition='payroll'` | Part A OT | OT payout line |
| `comp_off_credits` lapse (expired, unpaid) | comp-off engine | Optional lapse settlement (per policy) |

Payroll never writes leave/attendance tables; it reads these interfaces and tags consumption (`payroll_run_id`) back via a definer RPC to prevent double-consumption.

## C.5 UI Design

**Menu:** `/hrms/leave` (admin/approver) and `/hrms/me/leave` (self); Administration → HR → Leave for policy.

| Route | Screen | Who | Elements |
|---|---|---|---|
| `/hrms/leave` | Leave inbox | HOD, HR | Pending queue (aging), approve/reject with comment, balances peek |
| `/hrms/leave/:id` | Request detail | HOD, HR, self | Timeline, level chain (`leave_approvals`), attachment, day breakdown |
| `/hrms/leave/calendar` | Team leave calendar | HR, manager | Who's off, overlap heatmap, holiday overlay |
| `/hrms/leave/types` | Leave types & policy | HR, director | CRUD types, accrual/carry/sandwich/notice config, policy overrides |
| `/hrms/leave/holidays` | Holiday calendar | HR, director | Yearly list, optional/RH flags, office/state scope |
| `/hrms/leave/comp-off` | Comp-off register | HR | Credits, expiry, grants |
| `/hrms/leave/reports` | Leave reports | HR, director | Balance register, transactions, encashment, exports |
| `/hrms/me/leave` | My leave | all | Balances (CL/SL/EL…), apply, history, cancel |
| `/hrms/me/leave/apply` | Apply leave | all | Type, date range, half-day slot, reason, attachment; live day/balance preview |

**Calendar views:** team month grid colour-coded by type; holiday & WO overlay from Part B; hover shows approver chain. **Apply form** shows computed days (sandwich/WO/holiday aware) and remaining balance before submit.

## C.6 Workflow Design

**C.6.1 Leave application → multi-level approval**
1. Employee applies (`apply_leave`): type, dates, half-day, reason, attachment. RPC validates balance, overlap, notice-days, min/max, doc-required, gender/eligibility; computes `days` (sandwich/WO/holiday aware). On pass: `leave_requests` status `pending`, **pending hold** written to `leave_ledger`/balance; notify HOD (`leave_requested`).
2. **L1 — HOD** decides (`decide_leave`, level=1). Approve → status `hod_approved`, `current_level=2`, notify HR + employee (`leave_hod_decided`). Reject → `rejected`, release hold, notify.
3. **L2 — HR** decides. Approve (if `approval_levels`≤2) → status `approved`: convert hold → **debit** in `leave_ledger`, update `leave_balances.used`, mark muster days as leave; notify employee (`leave_hr_decided`, WhatsApp gated). Reject → release hold.
4. **L3 — Director** (only if type/duration requires) → final approve as above.
5. Every level writes `leave_approvals` + `audit_log`.

**C.6.2 Cancellation / withdrawal**
1. Employee cancels before start (or before final approve). RPC (`cancel_leave`): if only held → release hold; if already debited → `cancel_credit` ledger entry restores balance; status `cancelled`; muster reverted; notify HOD/HR (`leave_cancelled`).

**C.6.3 Accrual / carry-forward / lapse (scheduled, Administration-configured)**
1. Accrual job (cadence per `leave_types.accrual_method`) writes `accrual` ledger entries pro-rated for joiners/leavers.
2. Year-end job: carry-forward up to cap (`carry_forward` entry), lapse excess (`lapse` entry), open next-year `leave_balances`.
3. Comp-off expiry job: mark expired `comp_off_credits`, write `lapse`.

**C.6.4 Comp-off credit**
1. From Part A: OT with `disposition='comp_off'` (or manual holiday-work grant) → `comp_off_credits` row + `comp_off_credit` ledger entry with `expires_on`. Consumed via a normal `apply_leave` against the COMP_OFF type (FIFO by expiry).

**C.6.5 Encashment**
1. Year-end/F&F: HR triggers encashment of encashable balance → `encashment` debit in ledger + quantum exposed to Payroll (`get_encashment_quantum`). Payroll pays; HRMS records.

## C.7 Permission Matrix (Leave)

| Permission key | super_admin | director | hr | manager (HOD) | accounts | auditor |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `hrms.leave.apply` | self | self | self | self | self | self |
| `hrms.leave.view.self` | self | self | self | self | self | self |
| `hrms.leave.view` (team/all) | ✓ all | ✓ all | ✓ all | team | — | read |
| `hrms.leave.approve.hod` | ✓ | ✓ | ✓ | team | — | — |
| `hrms.leave.approve.hr` | ✓ | ✓ | ✓ | — | — | — |
| `hrms.leave.approve.director` | ✓ | ✓ | — | — | — | — |
| `hrms.leave.manage` (types/policy/holidays) | ✓ | ✓ | ✓ | — | — | — |
| `hrms.leave.balance.adjust` | ✓ | ✓ | ✓ | — | — | — |
| `hrms.leave.compoff.manage` | ✓ | ✓ | ✓ | — | — | — |
| `hrms.leave.encash` | ✓ | ✓ | ✓ | — | — | — |
| `hrms.leave.report` | ✓ | ✓ | ✓ | team | — | read |

RLS authoritative; `useCan()` affordance. "team" = `is_hod_of(target_user)`.

## C.8 API Design (described)

**Data-access (`modules/hrms/api/leave.ts`)**

| Function | Inputs | Output | Authz |
|---|---|---|---|
| `listLeaveTypes()` | — | type[] | any authenticated |
| `getLeaveBalances(userId, year)` | | balance[] | self / `leave.view` |
| `listLeaveRequests(filter)` | scope, status | request[] | scoped by role |
| `getLeaveRequest(id)` | id | request + approvals | own / approver / HR |
| `getTeamLeaveCalendar(range)` | dept, range | calendar[] | `leave.view` |
| `listHolidays(year, office)` | | holiday[] | any authenticated |
| `listCompOff(userId)` | | credit[] | self / HR |
| `getLeaveReport(kind, filter)` | balance/txn/encash | rows | `leave.report` |

**RPCs / Edge Functions**

| Name | Kind | Inputs | Output | Authz enforced |
|---|---|---|---|---|
| `apply_leave` | RPC (definer) | type_id, from, to, half_day, slot, reason, attachment | request | self; validates balance/overlap/notice/day-calc; writes hold |
| `decide_leave` | RPC (definer) | request_id, level, decision, comment | request | HOD/HR/Director per level; on final approve converts hold→debit atomically |
| `cancel_leave` | RPC (definer) | request_id | request | self before start / HR; releases or credits |
| `upsert_leave_type` / `upsert_leave_policy` | RPC (definer) | config payload | row | `leave.manage` |
| `upsert_holiday` | RPC (definer) | date, name, flags, scope | row | `leave.manage` |
| `avail_restricted_holiday` | RPC (definer) | holiday_id | grant + request | self; per-year RH cap |
| `accrue_leave` | RPC/cron (definer) | period | count | cron/HR; writes accrual ledger |
| `carry_forward_leave` | RPC/cron (definer) | year | count | cron/HR; carry+lapse |
| `grant_comp_off` | RPC (definer) | user_id, days, source, expires_on | credit | `leave.compoff.manage` / from OT flow |
| `expire_comp_off` | RPC/cron (definer) | as_of | count | cron |
| `encash_leave` | RPC (definer) | user_id, type_id, days, context | quantum + ledger | `leave.encash`; exposes to Payroll |
| `adjust_leave_balance` | RPC (definer) | user_id, type_id, delta, note | ledger | `leave.balance.adjust` |

All async wrapped in try/catch; user errors via `toast()`; balance guard trigger prevents negative paid balances; every transition writes `audit_log`. Notifications via `core/notifications` (`leave_requested`, `leave_hod_decided`, `leave_hr_decided`, `leave_cancelled`) honoring `reminder_settings`/`feature_flags` so staging stays sandboxed.

---

## Cross-part integration summary

| Flow | Produced in | Consumed in |
|---|---|---|
| Allocated shift + weekly-off | Part B (`shift_roster`) | Part A resolver (late/early/half/OT) |
| Holidays / restricted holidays | Part C (`holidays`) | Part A/B day suppression + sandwich rule |
| OT quantum + comp-off disposition | Part A (`attendance_overtime`) | Part C (`comp_off_credits`) + Payroll |
| Approved leave / LWP | Part C (`leave_ledger`, requests) | Part A muster + Payroll LOP feed |
| Muster LOP / encashment / OT payout | Parts A + C read models | **HRMS_03 Payroll** (never written by Payroll) |

**Configurability guarantee:** every rule in this document (grace, late, half-day, early-exit, OT threshold/rounding/cap, correction cut-off, shift timings, weekly-off patterns, rotations, leave quotas/accrual/carry/cap/notice/sandwich/RH cap, comp-off expiry, approval-chain length) is a **row in a config table or `attendance_settings`/`feature_flags`**, editable via Administration. No policy value is compiled into code.

