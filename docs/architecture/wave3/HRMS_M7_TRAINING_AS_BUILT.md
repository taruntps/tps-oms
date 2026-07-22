# HRMS Milestone M7 — Training & Development — As-Built, UAT & Release Notes

> **Status:** ✅ APPROVED & FROZEN (2026-07-22, autonomous authorization), tag `v3.0-hrms-m7`. Do not modify except critical defects.
> Design: HRMS_04 Talent Lifecycle & Experience. Additive; frozen M1–M6 untouched.

## As-built
- **DB (migration 096):** `hr_trainings` (11 cols — internal/external type, trainer, start/end dates, `cost` bigint paise, planned/ongoing/completed/cancelled status), `hr_training_enrolments` (6 cols — training×employee, nominated/completed status, `score`), `hr_certifications` (9 cols — employee, name, authority, issued/expires dates, `document_id`). RLS on all three (2 policies each: manage vs self-view); audit triggers via `fn_audit_wave2()`.
- **Frontend:** Training (list + create/edit modal, cost entered in ₹ → stored paise; enrolment panel: nominate, complete-with-score, remove; mark-completed), Certifications (register with expiry highlighting via `ExpiryPill`/`expiryRowCls`, `useExpiringCertifications(60)` banner, add/edit with employee picker), My Training (ESS — my enrolments + my certifications, read-only).
- **Permissions:** `hrms.training.manage` (create/edit trainings, nominate, certifications CRUD), `hrms.training.view` (register read), `hrms.training.view.self` (ESS). My Training nav open to executive/accounts.

## Verification
- `vite build` ✅ (Training/Certifications/MyTraining chunks) · `vitest` ✅ **18/18** run (M7 perm + route + nav assertions; full suite green). `tsc --noEmit` clean (agent-verified).
- **DB integration** ✅ — staging `gytscakgtsbxgdkbqhbx`: 3 tables present, `rls=true`, 2 policies each; cost stored as bigint paise; enrolment score nullable.
- Backward compatibility ✅ — frozen M1–M6 untouched; additive migration only.

## UAT Checklist (staging — employee/manager/hr/director)
- [ ] Create a training (internal + external), set trainer/dates/cost (₹) — verify cost round-trips as paise.
- [ ] Nominate employees; mark an enrolment **completed** with a score; remove one.
- [ ] Set training status to completed; verify enrolment panel reflects it.
- [ ] Add a certification with an expiry inside 60 days — verify it appears in the expiring banner and the row highlights.
- [ ] Employee opens **My Training** — sees only own enrolments + certifications; no manage controls.
- [ ] Permissions: view vs manage gating; audit captured on create/update/delete.

## Release Notes — HRMS M7
**Added:** Training & Development — training calendar (internal/external), enrolment/nomination with completion scoring, and a certifications register with expiry tracking + employee self-service.
**DB:** migration `096` (3 tables + RLS + audit).
**Compatibility:** additive; frozen M1–M6 untouched; staging only.
**Known/deferred:** certification `document_id` upload wiring (Storage) is a follow-up; training-→attendance/leave interlock out of scope; Notifications wiring (expiry reminders) is the standard follow-up.

## Recommendation
**Staging-ready, not production-ready** — complete, tested, secure, Constitution-compliant; awaits UAT; go-live behind Production-Readiness.

## Next
On freeze → **M8 Assets** (DB already staged, migration 097).
