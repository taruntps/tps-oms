# PR2 — Performance Audit (Phase 1, BEFORE) — Benchmark

> Measurement only — **no code changed**. Baseline captured at PR1 freeze (`v1.0-pr1-ui-nav`).
> Runtime field metrics (Lighthouse/FCP/LCP/TTI) require an authenticated staging session (login is the user's to run) — see §5 method. Static/build metrics below are exact.

## 1. Bundle (production `vite build`) — BEFORE
- **Total JS: ~1,901 kB raw** (~ fits code-split per-route chunks + shared/vendor).
- **Total CSS: ~56 kB.**
- Largest chunks (raw / gzip):
  | Chunk | raw | gzip | Note |
  |---|---|---|---|
  | `index` (entry) | **508 kB** | **148 kB** | React+router+query+supabase+radix+RHF+zod all here (no vendor split) |
  | `SoiTab` | **302 kB** | **100 kB** | **entirely `xlsx`** (static import) |
  | `types` | 82 kB | 22 kB | generated `src/types/database.ts` (2,386 lines) |
  | `PerformancePage` | 57 kB | 11 kB | |
  | `ProjectDetailPage` | 39 kB | 10 kB | hosts SoiTab |
  | `SettingsPage` | 33 kB | 8 kB | |
- **No `manualChunks`** configured → build warns >500 kB; vendor is not a stable cacheable chunk.
- **Routes ARE code-split** (lazy) — ~55 per-route chunks. Good; little to gain there.

## 2. Dependencies
- 26 runtime deps. **Unused (0 bytes in bundle, dead weight in `node_modules`):** `@vladmandic/human` (42 MB — Face-ID/attendance, never imported in `src`), `@tanstack/react-table` (never imported). → removal is PR3 (Face-ID decision) / PR4 cleanup, not a PR2 bundle issue.
- **`xlsx` (9.3 MB + `codepage` 8 MB)** — used only in `SoiTab` export; statically imported (see §4).

## 3. React Query — already tuned
Global defaults (`App.tsx`): `staleTime 60s`, `gcTime 5m`, `retry 1`, `refetchOnWindowFocus false`. A prior audit (doc 18) already eliminated the profile/notification/project refetch storm. 50 queries set explicit `staleTime`. **No global RQ change needed.**

## 4. Network / Supabase (static analysis)
- **193 `useQuery` sites; 115 `.select('*')`.** Broad selects fetch unneeded columns (payload weight), notably on hot paths.
- **Dashboard** (`/dashboard`) fans out **13** hooks/queries on mount (myProjects, notifications, directorStats, todayPunches, pendingPayments, clients, allProjects, staff, …). All are independent `useQuery` (parallel, RQ-deduped by key) — no obvious sequential waterfall, but some fetch full tables where a count/subset would do.
- No N+1 loops detected in the dashboard path (spot-check); a full N+1 sweep is out of PR2 scope unless a hot query is found.

## 5. Runtime metrics — method for the user (BEFORE)
Because the app is behind Supabase login, capture these on staging while logged in (record for BEFORE/AFTER):
1. Chrome DevTools → Lighthouse → Performance (mobile + desktop) on `/dashboard` and `/projects` → record **Score, FCP, LCP, TTI**.
2. Network tab (disable cache) → record **request count + transferred bytes** for `/dashboard` first load and for opening a project's **SOI tab**.
3. React DevTools Profiler → record commit count on `/dashboard` initial load.

## 6. Headline opportunities (feed the Phase-2 plan)
1. **`xlsx` static import in `SoiTab`** → 302 kB (100 kB gz) loads on tab open, not on export. **Biggest single win.**
2. **No `manualChunks`** → 508 kB entry, poor vendor caching across deploys.
3. **82 kB `types` chunk** — generated types should erase; investigate runtime leakage.
4. **Hot-path `select('*')`** on dashboard/lists — targeted narrowing.
