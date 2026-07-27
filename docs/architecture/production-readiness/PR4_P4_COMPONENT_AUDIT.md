# PR4 Phase 4 — Component & UI Consolidation Audit

> **Outcome: 0 consolidations, 0 code changes.** Every candidate failed the rules' bar ("consolidate only if behaviour identical", "never merge Feature Specific / on similarity alone", "if uncertain retain"). The codebase is already well-factored. This is the documented evidence.

## Component Inventory
- **Shared components (8):** `ClockBadge, DriveTab, ErrorBoundary, IdleTimeout, ProtectedRoute, RoleBasedRedirect, Sym, Toast` — each single-purpose, cross-cutting, widely used. No duplicates.
- **Layout components (4):** `AppShell, NotificationPanel, Sidebar, TopBar` — distinct, one each.
- **Feature components:** ~260 module/page components. Domain-specific.
- **Duplicate components found:** none that are safe to merge (see below).

## Findings & classification (evidence-based)
| Candidate | Evidence | Classification | Decision |
|---|---|---|---|
| `formatRupees` (lib/utils) vs `fmtPaise` (payrollShared) | Different: `fmtPaise` null-safe + bigint/string + **minFractionDigits 2** (`₹1,180.00`); `formatRupees` number-only + **maxFractionDigits 2** (`₹1,180`). **Different output.** 18 vs 12 consumers | Not identical | **Leave** (merging changes displayed decimals — UI behaviour change) |
| `StatusPill` ×4 (training/recruit/performance/invoice) + `RunStatusPill`/`HandoffStatusPill`/`TypePill`/`ExpiryPill` | Same idea, **different domain status→color maps** per module | Feature Specific | **Leave** (rule: never consolidate Feature Specific) |
| `AttendancePage` (legacy face-punch) vs HRMS attendance | Different purpose (punch UI + camera vs M2 self/team views) | Feature Specific | **Leave** |
| `DashboardPage` (workspace `/dashboard`) vs HRMS `DashboardPage` (`/hrms/dashboard`) | Different content (personal workspace vs HR aggregates) | Feature Specific | **Leave** |
| `PerformancePage` (report `/reports/performance`) vs HRMS `PerformancePage` (M6 reviews) | Different domain | Feature Specific | **Leave** |
| legacy `EmployeesPage`/`EmployeeDetailPage`/`ReferralsPage` vs module versions | Functional duplicates, **but legacy ones are wired** (role landings `/employees` for hr, back-compat `/referrals`) | Legacy (wired) | **Leave** — consolidating needs a `RoleBasedRedirect` workflow change (out of PR4 scope; flagged in Phase 3) |
| `KpiCard`/`KpiMini`/`SectionHeader`/`EmptyState`/`SkeletonList` | Module-private helpers, defined once inside their page; not duplicated across files | Feature Specific | **Leave** |
| `ProtectedRoute` `return children` | Real auth/role guard (returns child on authorized path) | Shared Component | **Leave** (not a no-value wrapper) |

## UI Consistency — observations (report only; fixing = refactor, out of PR4 scope)
1. **Two money formatters** with different decimal behaviour → cross-module display drift (`₹1,180` in general pages vs `₹1,180.00` in HRMS). *Cosmetic; unifying = behaviour change → deferred.*
2. **No shared `Spinner`/`EmptyState`/`Modal` primitives** — 16 files inline `animate-spin`; modals (`fixed inset-0 bg-black/40 …`) and empty states are repeated inline per page. Visually consistent but duplicated markup. *Extracting shared primitives is a refactor/new-abstraction → explicitly out of PR4 scope ("cleanup not redesign").* Candidate for a future dedicated UI-primitives task.
3. **Consistent, good:** single `Toast` (used app-wide), single `ErrorBoundary`, single `ProtectedRoute`/`RoleGuard`, single `Sym` icon component, single `IdleTimeout`.

## Cleanup Summary
- Files modified: **0**
- Files removed: **0**
- Components merged: **0**
- Components retained: all
- Reason: no candidate is behaviourally identical; the closest (`formatRupees`/`fmtPaise`) differ in output + type handling; the rest are Feature Specific or wired-legacy.

## Risk Assessment
No changes → **no risk introduced.** (Consolidating any candidate would have risked UI/behaviour regressions — correctly avoided per the rules.)

## Validation
No code changed since Phase 3 (`34f6550`), which is green: `tsc -b` clean · `vite build` ok · `vitest` **34/34**. Working tree clean.

## Recommendation
Component architecture is production-appropriate. The only genuine improvement (shared Spinner/EmptyState/Modal primitives + one money formatter) is a **refactor**, not cleanup — recommend a small, separate, approved task **after** PR5 if desired; not required for production freeze.
