# PR2 — Optimization Plan (Phase 2) — for approval

> Implement **only approved** items. Each has Problem · Root Cause · Solution · Expected · Risk · Files.
> Guardrails: no business/permission/workflow/UI/nav/schema change; improve-only; staging only.

## CRITICAL

### C1 — Lazy-load `xlsx` in SoiTab (export-on-demand)
- **Problem:** `SoiTab` chunk is 302 kB (100 kB gz) and loads whenever a user opens a project's SOI tab.
- **Root cause:** `import * as XLSX from 'xlsx'` is a static top-level import, but `xlsx` is used only inside the "Export" handler.
- **Solution:** replace with `const XLSX = await import('xlsx')` inside the export function; drop the static import. Behaviour identical.
- **Expected:** `SoiTab` chunk ~302 kB → ~3–5 kB; `xlsx` becomes its own chunk loaded **only on export click**. ~100 kB gz removed from the project-detail path.
- **Risk:** **Low** — pure deferral; same output file.
- **Files:** `src/pages/projects/tabs/SoiTab.tsx`.

## HIGH

### H1 — Rollup `manualChunks` vendor split
- **Problem:** `index` entry is 508 kB (148 kB gz); every app change busts the whole vendor payload (poor caching).
- **Root cause:** no `build.rollupOptions.output.manualChunks`.
- **Solution:** split stable vendors: `react`/`react-dom`/`react-router-dom` → `vendor-react`; `@supabase/*` → `vendor-supabase`; `@tanstack/*` → `vendor-query`; `@radix-ui/*`+`react-hook-form`+`zod` → `vendor-ui`.
- **Expected:** entry shrinks materially; vendor chunks cached across deploys; parallel download on cold load. (Total bytes ≈ same; **warm loads + caching improve**.)
- **Risk:** **Low–Medium** — build-config only; verify no init-order/circular issues via `vite build` + smoke.
- **Files:** `vite.config.ts`.

### H2 — Shrink the 82 kB `types` chunk *(investigation → fix if leakage)*
- **Problem:** a `types` chunk (82 kB / 22 kB gz) ships though generated Supabase types should erase at compile.
- **Root cause:** likely value (non-`type`) imports from `src/types` pulling runtime, or const maps.
- **Solution:** enforce `import type { … }` for type-only imports; relocate any runtime constants; confirm chunk disappears.
- **Expected:** up to ~22 kB gz removed **if** it is type leakage; else document as real runtime and skip.
- **Risk:** **Low–Medium** — must not convert value imports; guarded by build + tsc.
- **Files:** `src/types/*`, top importers.

## MEDIUM

### M1 — Narrow hot-path `select('*')` (dashboard + main lists only)
- **Problem:** 115 broad selects; dashboard fetches full rows.
- **Root cause:** `select('*')` fetches unneeded columns.
- **Solution:** narrow the **~6 hottest** queries (dashboard projects/clients/staff/punches/payments/notifications) to used columns. **Not** a blanket 115-query sweep.
- **Expected:** smaller payloads, faster dashboard first paint.
- **Risk:** **Medium** — a missing column breaks a view; each change tested against its consumer.
- **Files:** `src/hooks/useDashboard.ts` (+ referenced hooks).

### M2 — Dashboard request trim
- **Problem:** 13 queries on `/dashboard` mount.
- **Root cause:** some fetch whole tables where a count/subset suffices (e.g. `allProjects` for a number).
- **Solution:** swap full-table fetches for `count`/subset where only aggregates are shown; keep everything parallel.
- **Expected:** fewer/smaller dashboard requests.
- **Risk:** **Low–Medium** — verify each widget still renders identical numbers.
- **Files:** `DashboardPage.tsx`, `useDashboard.ts`.

## LOW / DEFERRED
- **L1** Remove unused deps `@vladmandic/human`, `@tanstack/react-table` — **defer to PR3 (Face-ID decision) / PR4** (not in bundle today; `node_modules`/install-time only).
- **L2** Skeleton loaders — already present on dashboard; extend to 1–2 list pages if missing (cosmetic).

## Recommended approval set
**C1 + H1** (highest value, lowest risk, clean before/after bundle numbers) — **strongly recommended.**
**+ H2** (investigation; safe to include).
**+ M1/M2** (measurable but touch data-fetch — include only if you want dashboard payload work this PR).
**L1/L2 deferred.**

## Verification (after implementation)
`vite build` · `tsc --noEmit` · `vitest` · bundle BEFORE/AFTER table · (network BEFORE/AFTER via §5 method, user-run). No functional regressions.
