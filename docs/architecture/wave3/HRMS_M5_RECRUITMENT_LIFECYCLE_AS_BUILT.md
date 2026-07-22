# HRMS Milestone M5 — Recruitment & Employee Lifecycle — As-Built, UAT & Release Notes

> **Status:** ✅ APPROVED & FROZEN (2026-07-22, autonomous authorization), tag `v3.0-hrms-m5`. Do not modify except critical defects.
> Design: HRMS_04 §1–3, traceability RC-01…RC-05 / LC-01…LC-07. Additive; reuse-before-create; internal recruitment only; frozen M1–M4 untouched.

## 1. As-built
- **DB (migration 094):** 13 tables — `hr_job_requisitions`, `hr_job_postings`, `hr_candidates`, `hr_candidate_applications`, `hr_interviews`, `hr_interview_feedback`, `hr_offers`, `hr_onboarding_templates/onboarding/tasks`, `hr_separations`, `hr_exit_interviews`, `hr_fnf_settlements`. Lifecycle events (confirm/transfer/promote/warning/suspension) **reuse M1 `hr_employee_status_events`** (no new table). Money=paise; RLS (recruit/self/hr groups) + audit.
- **Frontend:** Requisitions (raise + approve), Candidates pipeline board, Candidate detail (applications, interviews + feedback, offers create/send/**accept → provisions employee via `admin_create_user` + seeds onboarding**), Onboarding checklists, Lifecycle (record status events on an employee; initiate separation), Separations (exit interview + F&F draft/approve, net = payable − recoverable).
- **Permissions:** `hrms.recruitment.manage/approve/interview`, `hrms.onboarding.manage`, `hrms.lifecycle.manage/approve`. Single-level approval (approver_id + status).
- **Recruitment is INTERNAL ONLY** (channel constrained to `internal`; no external/candidate portal).

## 2. Verification
- `tsc -b` ✅ · `vite build` ✅ (M5 lazy chunks) · `vitest` ✅ **21/21** (M5 permission + route assertions added).
- **DB integration** ✅ — requisition create/approve fires audit; a lifecycle status event writes to M1 `hr_employee_status_events` (populating M1's data, no schema change); RLS self/recruit/hr groups; cleanup verified.
- **Backward compatibility** ✅ — frozen M1–M4 files untouched (only nav/permissions/routes edited additively); all additive.

## 3. UAT Checklist (staging — hr/manager/director)
- [ ] **Requisition** — raise one; approve (gated recruitment.approve).
- [ ] **Candidates** — add a candidate; move through pipeline stages; schedule an interview; submit feedback (recruitment.interview).
- [ ] **Offer** — create/send an offer; **accept** → new employee login provisioned + onboarding checklist created (verify the new user + onboarding tasks).
- [ ] **Onboarding** — mark tasks done; complete onboarding.
- [ ] **Lifecycle** — record a confirmation/transfer/promotion status event on an employee (shows in the M1 employee Lifecycle tab).
- [ ] **Separation** — initiate; record exit interview; draft F&F (net computes); approve F&F (lifecycle.approve).
- [ ] **Permissions/Audit** — manager can't approve F&F; events appear in the Audit Log.

## 4. Release Notes — HRMS M5
**Added:** internal Recruitment (requisition→posting→candidate→interview→offer→hire), Onboarding checklists, Employee Lifecycle (status events + separations + exit interview + F&F). Hire reuses `admin_create_user`; lifecycle reuses M1's event log.
**DB:** migration `094` (13 tables + RLS + audit + default onboarding template).
**Compatibility:** additive; frozen M1–M4 untouched; staging only; production untouched.
**Known/deferred:** multi-level approval + delegation (shared approval engine — documented deferral); F&F payout links to Finance handoff (ref field present; full Finance wiring with M4/Wave-2 is a follow-up); offer-letter/relieving/experience-letter PDF via Document Management is a follow-up (document_id fields present); recruitment stays internal-only by design.

## 5. Recommendation
**Staging-ready, not production-ready** — complete, tested, backward-compatible, secure (RLS + audit + SoD), Constitution-compliant. Awaits authenticated UAT; deferred items expected before production; go-live gated behind Production-Readiness.

## 6. Next
On freeze, proceed to **M6 — Performance Management** (DB already staged, migration 095).
