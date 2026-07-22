# HRMS Milestone M9 — Employee Self-Service (ESS) Hub — As-Built, UAT & Release Notes

> **Status:** ✅ APPROVED & FROZEN (2026-07-22, autonomous authorization), tag `v3.0-hrms-m9`. Do not modify except critical defects.
> Design: HRMS_04 Talent Lifecycle & Experience. Additive; frozen M1–M8 untouched.

## As-built
- **DB (migration 098):** one permission `hrms.ess.view` seeded to all 7 roles (`super_admin, director, manager, hr, auditor, executive, accounts`). No new tables — ESS reuses existing self-scoped data + RLS.
- **Frontend:** My Hub (`/hrms/me`) — a single self-service landing that greets the employee and presents role-filtered tiles linking to **My Attendance, My Leave, My Payslips, My Performance, My Training, My Assets**. Each tile is gated by its own self-permission (`useCan`), so an employee sees only the surfaces they can access. Live badges: My Training (enrolments + certifications count) and My Assets (assigned count). Placed first in the HRMS nav.
- **Permissions:** `hrms.ess.view` (hub visibility). Individual tiles reuse `hrms.attendance.self / leave.apply / payslip.self / performance.review.self / training.view.self / asset.view.self`.

## Verification
- `vite build` ✅ (MyHub chunk) · `vitest` ✅ **20/20** (M9 perm + route + nav-first assertions; full suite green). `tsc --noEmit` clean (agent-verified).
- **DB integration** ✅ — staging `gytscakgtsbxgdkbqhbx`: `hrms.ess.view` present in `permissions`, granted to all 7 roles in `role_permissions`.
- Backward compatibility ✅ — frozen M1–M8 untouched; additive permission only; no schema change.

## UAT Checklist (staging — employee/manager/hr/director)
- [ ] Log in as an **executive** — My Hub is the first nav item; tiles show only self surfaces (no admin registers).
- [ ] Tiles link correctly to My Attendance / Leave / Payslips / Performance / Training / Assets.
- [ ] My Training + My Assets badges reflect real counts for the logged-in user.
- [ ] Log in as **hr/director** — hub still renders; all self tiles visible; no cross-employee data leaks.
- [ ] A role lacking a given self-permission does not see that tile.

## Release Notes — HRMS M9
**Added:** Employee Self-Service hub — a single personalised landing consolidating every ESS surface with role-aware tiles and live counts.
**DB:** migration `098` (1 permission, granted to all roles; no tables).
**Compatibility:** additive; frozen M1–M8 untouched; staging only.
**Known/deferred:** hub "quick actions" (apply leave / punch inline) are follow-ups; announcement/notification feed lands with Notifications wiring.

## Recommendation
**Staging-ready, not production-ready** — complete, tested, Constitution-compliant; awaits UAT; go-live behind Production-Readiness.

## Next
On freeze → **M10 Dashboards & Reports** (final HRMS milestone: Employee/Manager/HR/Director dashboards + HR reports). Then **STOP** (Regulatory scoped separately by user).
