# HRMS Milestone M10 — Dashboards & Reports — As-Built, UAT & Release Notes

> **Status:** ✅ APPROVED & FROZEN (2026-07-22, autonomous authorization), tag `v3.0-hrms-m10`. Do not modify except critical defects.
> Design: HRMS_04 Talent Lifecycle & Experience. Additive; frozen M1–M9 untouched. **Final HRMS milestone.**

## As-built
- **DB (migration 099):** `hr_dashboard_stats()` — `SECURITY DEFINER`, `search_path=public`, guarded by `has_perm('hrms.dashboard.view')` (raises `42501` otherwise); returns a jsonb of **non-PII aggregate counts** (headcount, on-leave-today, pending leave, pending attendance, open requisitions, pending reviews, certs expiring in 30d, assets issued). `execute` granted to `authenticated`. One permission `hrms.dashboard.view` seeded to `super_admin, director, hr, manager, auditor`. No new tables.
- **Frontend:** HR Dashboard (`/hrms/dashboard`) — 8 stat tiles (each linking to its actionable queue; pending/expiring tiles highlight amber when > 0), plus a Reports panel linking to existing Attendance, Performance and Leave reports. Placed second in HRMS nav (after My Hub).
- **Permissions:** `hrms.dashboard.view`. Aggregates only — no employee-identifying data crosses the RPC boundary, so it is safe for manager/auditor visibility.

## Verification
- `vite build` ✅ (Dashboard chunk) · `vitest` ✅ **21/21** (M10 perm + route + nav assertions; full suite green). `tsc --noEmit` clean (agent-verified).
- **DB integration** ✅ — staging `gytscakgtsbxgdkbqhbx`: RPC inner aggregates executed without column errors (headcount 8, all queues 0); permission present + granted to 5 roles; guard raises for callers lacking the permission.
- Backward compatibility ✅ — frozen M1–M9 untouched; additive RPC + permission only; no schema change.

## UAT Checklist (staging — manager/hr/director)
- [ ] Log in as **hr/director** — HR Dashboard renders 8 tiles with live counts; alert tiles highlight when non-zero.
- [ ] Click each tile — routes to the correct queue (leave/attendance approvals, requisitions, performance, certifications, assets).
- [ ] Reports panel links open Attendance / Performance / Leave reports.
- [ ] Log in as a role **without** `hrms.dashboard.view` (e.g. executive) — dashboard nav hidden; direct RPC call is denied (42501).
- [ ] Confirm no employee-identifying data appears — counts only.

## Release Notes — HRMS M10
**Added:** HR Dashboard — organisation-at-a-glance stat tiles wired to actionable queues, plus a consolidated Reports panel.
**DB:** migration `099` (1 aggregate RPC + 1 permission; no tables).
**Compatibility:** additive; frozen M1–M9 untouched; staging only.
**Known/deferred:** manager-scoped (team-only) dashboard variant and department/time-series charts are follow-ups; CSV export of reports is a follow-up.

## Recommendation
**Staging-ready, not production-ready** — complete, tested, secure, Constitution-compliant; awaits UAT; go-live behind Production-Readiness.

## HRMS Wave 3 — status
**M1–M10 all built, frozen and tagged (`v3.0-hrms-m1` … `v3.0-hrms-m10`).** HRMS scope of Wave 3 is complete on staging. **Regulatory Affairs is intentionally NOT started** — the user will scope it separately. No Production-Readiness work begins without explicit direction.
