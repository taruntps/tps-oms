# PR4 — Functional Cleanup — Final Report

> All 6 phases complete. Evidence-based, conservative (cleanup not refactor). Every phase gated on `tsc -b` + `vite build` + `vitest` (34/34 throughout). Commits `5c3b179` → `63ac0d0` on `origin/staging`.

## 1. Functional Cleanup Report
| Phase | Action | Evidence | Result |
|---|---|---|---|
| **1 — Dead code** | Removed 4 files: `ClientDocuments.tsx` + `useClientDocuments.ts`, `DocumentsTab.tsx` + `useDocuments.ts` | whole-tree scan (277 files) → 2 unreferenced roots + their single-consumer hooks | ✅ |
| **2 — Dependencies** | Removed 12 unused packages | 0 real refs repo-wide | ✅ |
| **3 — Route audit** | Removed 1 dead route `/reports/queries` + `QueriesReportPage` | 0 refs, not a landing, no nav/link | ✅ |
| **4 — Component cleanup** | 0 consolidations | no candidate behaviour-identical; rest Feature Specific / wired-legacy | ✅ (already well-factored) |
| **5 — Module audit** | 0 changes | 0 orphans, 0 obsolete nav (all 57 nav→routes resolve) | ✅ |
| **6 — Code quality** | Restored ESLint config + fixed 4 lint errors | see §3 | ✅ |

**Totals:** 5 files removed (4 dead + 1 dead-route page), 12 packages removed, 1 dead route removed, 4 lint errors fixed, 1 broken tool (ESLint) restored. No feature/behaviour/permission/workflow change.

## 2. Dependency Report
- **26 → 14 runtime deps.** Removed: 10 unused `@radix-ui/*`, `@tanstack/react-table`, `class-variance-authority` (shadcn scaffold leftovers; no `src/components/ui/`).
- **Retained — Required (13):** react, react-dom, react-router-dom, @tanstack/react-query, @supabase/supabase-js, react-hook-form, @hookform/resolvers, zod, clsx, tailwind-merge, @radix-ui/react-toast, tailwindcss-animate (config plugin), xlsx.
- **Retained — Future Reserved (1):** @vladmandic/human (Attendance on-device engine).
- **Bundle impact:** 0 (unused deps weren't bundled) — win is smaller install + supply-chain surface.
- **Vulnerabilities:** unchanged 4 (react-router moderate + xlsx high) — both verified **unreachable** in PR3 M2 (no user-controlled nav targets / no SSR; xlsx export-only). Removed packages carried no vulns.

## 3. Code Quality Report
- **TODO/FIXME/HACK:** 0 real (2 hits were input placeholders `91XXXXXXXXXX` / `XXXX XXXX XXXX`).
- **Dead imports / unused locals:** 0 — `tsc -b` (`noUnusedLocals`/`noUnusedParameters`) already enforces this in the build gate.
- **ESLint:** was **broken** (v9 installed, plugins present, but no `eslint.config.js`). Restored the flat config (0 new deps) + fixed the v9-invalid `--ext` script. Fixed all **4 errors** (unused-expression, useless-escape, irregular-whitespace, unused-var-via-ignoreRestSiblings). Now: **0 errors, 554 warnings** — warnings are `@typescript-eslint/no-explicit-any` (the deliberate `supabase as any` for untyped tables) + `react-hooks/exhaustive-deps` (fixing changes effect behaviour). Both intentionally left as non-blocking warnings.

## 4. Remaining Technical Debt (deferred — not PR4 scope)
1. **RoleBasedRedirect lands on legacy routes** (`super_admin`/`director`→`/director`, `hr`→`/employees`) even though PR1 made module versions canonical. Blocks removing the legacy `pages/director`, `pages/employees`, `pages/referrals`. **Fix = a workflow change (where users land) → PR5 decision.** Then those 3 legacy dirs become removable.
2. **No shared UI primitives** (`Spinner`/`EmptyState`/`Modal`) → inline patterns repeated (16 spinners, per-page modals). Extracting = a refactor → optional post-PR5 task.
3. **Two money formatters** (`formatRupees` no-min-decimals vs `fmtPaise` always-2) → minor `₹1,180` vs `₹1,180.00` display drift. Unifying = behaviour change.
4. **554 ESLint `no-explicit-any` warnings** — reflect the untyped-DB `as any` pattern; would clear if the Supabase Database types were regenerated to cover the newer HR tables. Optional.

## 5. Production Readiness Impact
- **Maintainability ↑:** −5 files, −12 deps, −1 dead route, working linter restored.
- **Attack surface ↓:** 12 fewer packages.
- **Risk introduced:** none — every change evidence-based, build+tests green (34/34) after every phase, fully reversible via git.
- **No functional/behaviour/permission/workflow change.** App behaviour identical.

## Updated PR4 Progress
| Phase | Status |
|---|---|
| Phase 1 – Dead Code | ✅ |
| Phase 2 – Dependency Cleanup | ✅ |
| Phase 3 – Route Audit | ✅ |
| Phase 4 – Component Cleanup | ✅ |
| Phase 5 – Module Audit | ✅ |
| Phase 6 – Code Quality | ✅ |

**PR4 COMPLETE.** Awaiting approval before PR5. (Two items above — the RoleBasedRedirect landing consolidation and the prod security hotfix from PR3 — are natural PR5 inputs.)
