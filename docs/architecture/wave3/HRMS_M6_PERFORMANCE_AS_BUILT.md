# HRMS Milestone M6 — Performance Management — As-Built, UAT & Release Notes

> **Status:** ✅ APPROVED & FROZEN (2026-07-22, autonomous authorization), tag `v3.0-hrms-m6`. Do not modify except critical defects.
> Design: HRMS_04 §4, traceability PF-01…PF-04. Additive; frozen M1–M5 untouched.

## As-built
- **DB (migration 095):** `hr_review_cycles`, `hr_goals` (KRA/KPI, weighted), `hr_reviews` (self→manager→calibration→final, unique per employee×cycle×stage), `hr_recommendations` (increment/promotion; `salary_revision_id` links to M4 when applied). Self-scoped RLS + audit.
- **Frontend:** My Performance (ESS: goals, self-review, recommendations), Performance (team: goals + review status, manager reviews), Cycles setup (cycle CRUD, goals editor, calibration/final rating, raise/approve recommendations), Reports (rating distribution + goals progress).
- **Permissions:** `hrms.performance.manage/review.self/review.manager/view/recommend.approve`. Single-level review flow.

## Verification
- `vite build` ✅ (Performance chunks) · `vitest` ✅ **22/22** (M6 perm + route assertions). `tsc --noEmit` clean (agent-verified).
- **DB integration** ✅ — cycle/goal/review create fires audit; cascade cleanup; RLS self-scoped.
- Backward compatibility ✅ — frozen M1–M5 untouched; additive.

## UAT Checklist (staging — employee/manager/hr/director)
- [ ] Open a review cycle (hr); set KRA/KPI goals for an employee.
- [ ] Employee submits a **self-review**; manager submits a **manager review**.
- [ ] HR runs calibration/final rating; raises an increment/promotion **recommendation**; director **approves** (recommend.approve).
- [ ] Reports show rating distribution + goals progress.
- [ ] Permissions: employee sees only own; manager reviews team; audit captured.

## Release Notes — HRMS M6
**Added:** Performance Management — configurable review cycles, weighted KRA/KPI goals, multi-stage reviews, increment/promotion recommendations.
**DB:** migration `095` (4 tables + self-scoped RLS + audit).
**Compatibility:** additive; frozen M1–M5 untouched; staging only.
**Known/deferred:** recommendation → M4 salary-revision auto-link (id field present; wiring is a follow-up); 360°/peer reviews out of scope; Notifications wiring is the standard follow-up.

## Recommendation
**Staging-ready, not production-ready** — complete, tested, secure, Constitution-compliant; awaits UAT; go-live behind Production-Readiness.

## Next
On freeze → **M7 Training** (DB already staged, migration 096).
