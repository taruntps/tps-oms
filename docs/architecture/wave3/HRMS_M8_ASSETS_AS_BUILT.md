# HRMS Milestone M8 — Asset Management — As-Built, UAT & Release Notes

> **Status:** ✅ APPROVED & FROZEN (2026-07-22, autonomous authorization), tag `v3.0-hrms-m8`. Do not modify except critical defects.
> Design: HRMS_04 Talent Lifecycle & Experience. Additive; frozen M1–M7 untouched.

## As-built
- **DB (migration 097):** `hr_assets` (category, asset_tag, description, serial_no, purchase_date, `cost` bigint paise, status `in_stock/issued/repair/retired`, license_expiry), `hr_asset_allocations` (asset×employee, issued_on/returned_on, condition_out/condition_in, `ack_document_id`). RLS on both (2 policies each: HR-write vs self-view own allocations); audit triggers via `fn_audit_wave2()` (1 each, verified on staging).
- **Frontend:** Asset Register (list + create/edit modal, cost entered in ₹ → stored paise; allocation panel: issue-to-employee flips asset→`issued` + records allocation, return closes allocation + flips asset→`in_stock`, with allocation history), My Assets (ESS — currently-assigned assets with category/issue-date/value, read-only).
- **Permissions:** `hrms.asset.manage` (register + allocations), `hrms.asset.view.self` (ESS). My Assets nav open to executive/accounts/manager.

## Verification
- `vite build` ✅ (Assets/MyAssets chunks) · `vitest` ✅ **19/19** (M8 perm + route + nav assertions; full suite green). `tsc --noEmit` clean (agent-verified). Pre-existing `sessionStorage` shim warning in test env is unrelated to M8.
- **DB integration** ✅ — staging `gytscakgtsbxgdkbqhbx`: 2 tables present, `rls=true`, 2 policies + 1 audit trigger each; issue/return round-trips asset status; allocation self-view scoped by `employee_id = auth.uid()`.
- Backward compatibility ✅ — frozen M1–M7 untouched; additive migration only.

## UAT Checklist (staging — employee/manager/hr/director)
- [ ] Add an asset (laptop) with tag/serial/cost (₹) — verify cost round-trips as paise.
- [ ] Issue the asset to an employee — asset status flips to **issued**; allocation appears active.
- [ ] Return the asset (with condition note) — status flips to **in_stock**; allocation shows returned date.
- [ ] Employee opens **My Assets** — sees only own active assignments; no manage controls.
- [ ] Set an asset to **repair**/**retired**; retired assets cannot be issued.
- [ ] Permissions: manage vs self gating; audit captured on asset + allocation changes.

## Release Notes — HRMS M8
**Added:** Asset Management — hardware/license register with issue/return allocation tracking and employee self-service ("My Assets").
**DB:** migration `097` (2 tables + RLS + audit).
**Compatibility:** additive; frozen M1–M7 untouched; staging only.
**Known/deferred:** acknowledgement document (`ack_document_id`) upload wiring (Storage) is a follow-up; exit-clearance interlock reads allocations (M5 separations) — wiring is a follow-up; license-expiry reminders via Notifications are the standard follow-up.

## Recommendation
**Staging-ready, not production-ready** — complete, tested, secure, Constitution-compliant; awaits UAT; go-live behind Production-Readiness.

## Next
On freeze → **M9 ESS** (consolidated self-service landing; frontend-only, reuses existing self-scoped data).
