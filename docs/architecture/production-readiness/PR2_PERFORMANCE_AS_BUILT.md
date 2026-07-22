# PR2 — Performance Optimization — As-Built

> **Status:** ✅ Implemented on staging, awaiting **PR2 acceptance**. Freeze + tag `v1.0-pr2-performance`.
> **Approved scope:** C1 (lazy-load xlsx) + H1 (vendor manualChunks). Improve-only; no business/permission/workflow/UI/nav/schema change.

## 1. Audit Report
See `PR2_PERFORMANCE_AUDIT.md` (Phase-1 baseline). Headlines: `xlsx` statically imported in `SoiTab` (302 kB on tab open); no `manualChunks` (508 kB entry, poor vendor caching); React Query already tuned; `@vladmandic/human` + `@tanstack/react-table` unused (deferred to PR3/PR4).

## 2. Benchmark Results (BEFORE → AFTER, production build)
| Chunk / metric | BEFORE | AFTER | Δ |
|---|---|---|---|
| Entry `index` | 508 kB / 148 kB gz | **46.6 kB / 13 kB gz** | **−91%** |
| `SoiTab` (SOI-tab open) | 302 kB / 100 kB gz | **19 kB / 5.7 kB gz** | **−94%** |
| `xlsx` | (inside SoiTab, eager) | **429 kB / 143 kB gz — async, export-only** | moved off hot path |
| `vendor-react` | — | 156 kB / 50 kB gz | new, cacheable |
| `vendor-supabase` | — | 206 kB / 53 kB gz | new, cacheable |
| `vendor-ui` | — | 128 kB / 37 kB gz | new, cacheable |
| `vendor-query` | — | 45 kB / 13 kB gz | new, cacheable |
| `>500 kB` build warning | present | **resolved** | — |

**Interpretation:**
- **Entry parse cost cut ~91%** — the render-blocking entry chunk is now 46 kB (was 508 kB); vendors load in parallel.
- **Opening a project's SOI tab now transfers ~6 kB gz instead of ~100 kB gz (−94%)**; the full `xlsx` library (143 kB gz) downloads **only when the user clicks Export**.
- **Warm redeploy loads** drop from re-downloading the 148 kB-gz entry to just the ~13 kB-gz entry + changed route chunk — the split vendor chunks stay cached.
- Total app JS is roughly flat (splitting trades a little cross-chunk minification for parallelism + caching); the wins are critical-path/interaction/caching, not raw total.

## 3. Optimization Plan
See `PR2_OPTIMIZATION_PLAN.md`. Implemented **C1 + H1**; H2/M1/M2 not approved this PR; L1/L2 deferred.

## 4. Files Modified
- `src/pages/projects/tabs/SoiTab.tsx` — `import * as XLSX` → `const XLSX = await import('xlsx')` inside `downloadExcel()` (already `async`).
- `vite.config.ts` — `build.rollupOptions.output.manualChunks`: `vendor-react` / `vendor-supabase` / `vendor-query` / `vendor-ui` / `vendor`; `xlsx`/`codepage` left as async chunk.

## 5. APIs Optimized
None (no data-fetch changes in approved scope; M1/M2 deferred).

## 6. Database Changes
**None.**

## 7. Bundle Size Comparison
See §2. Entry −91%, SoiTab −94%, xlsx moved to on-demand, vendors split/cacheable.

## 8. Network Comparison
- **SOI tab open:** −~94 kB gz transferred (xlsx no longer fetched until export).
- **App cold load:** entry+vendors now 6 parallel chunks (HTTP/2 friendly) vs one 148 kB-gz blob.
- **Runtime field numbers** (Lighthouse/FCP/LCP/TTI, network request counts) require a logged-in staging session — capture via the method in `PR2_PERFORMANCE_AUDIT.md` §5 for the acceptance record.

## 9. Performance Improvements
Faster entry parse/TTI; near-eliminated SOI-tab payload; cacheable vendors across deploys; resolved oversized-chunk warning. No functional change.

## 10. Risks
**Low.** `xlsx` deferral is a pure load-timing change (export output identical). `manualChunks` verified via `vite build` (clean) + `tsc --noEmit` (clean) + `vitest` (34/34); vendor grouping avoids init-order issues (React/router together; xlsx untouched as async).

## 11. Testing Results
`vite build` ✅ (no warnings) · `tsc --noEmit` ✅ 0 errors · `vitest` ✅ **34/34**. Browser UAT (export an SOI to confirm the .xlsx still downloads; smoke the app shell) is on the acceptance checklist — login is the user's to run.

## 12–13. Git Commit / Tag
Commit on `staging`; tag `v1.0-pr2-performance`.

## PR2 Acceptance Checklist (user UAT on staging)
- [ ] App loads normally; no console/runtime errors on `/dashboard`, `/projects`, HRMS.
- [ ] Open a project's **SOI tab** — loads fast; click **Export** — the `.xlsx` downloads correctly (xlsx chunk fetched on click).
- [ ] (Optional) Lighthouse before/after on `/dashboard` per audit §5; record scores.
- [ ] Confirm no functional regressions in any exercised flow.
