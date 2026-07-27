# PR5 Phase 1 — Production Readiness Review

> Read-only current-state review (staging `gytscakgtsbxgdkbqhbx`; prod = drift-verify at go-live). No changes. Feeds the Phase-2 checklists + Final Audit.

## Database
| Metric | Value | Verdict |
|---|---|---|
| Base tables | 156 | — |
| **RLS coverage** | **156/156 (100%)**, 0 without | ✅ excellent |
| RLS policies | 341 | ✅ |
| Functions | 65 (58 `SECURITY DEFINER`) | ✅ (PR3 closed the 2 unguarded exposures on staging; prod pending) |
| Triggers | 125 | ✅ (audit + sync) |
| Indexes | 275 | ✅ |
| Migrations applied | 106 | ⚠️ prod migration history unverified (drift) |

## Performance advisor — 976 findings, **all scalability (none correctness/security)**
| Finding | Count | Level | Assessment |
|---|---|---|---|
| `multiple_permissive_policies` | 575 | WARN | Multiple permissive RLS policies per role/action → each query evaluates several. Negligible at current scale; consolidation is a post-go-live optimization. |
| `auth_rls_initplan` | 126 | WARN | Policies call `auth.uid()`/`auth_role()` per-row; wrapping in `(select …)` evaluates once. Highest-value scale optimization; but touches 126 policies → risky mass-migration → **backlog**. |
| `unindexed_foreign_keys` | 232 | INFO | FKs lacking covering indexes → slower joins/cascades at scale. Add selectively where query patterns justify. |
| `unused_index` | 41 | INFO | Never-used indexes → minor write overhead. Optional drop. |
| `duplicate_index` | 1 | WARN | One redundant index → **safe trivial drop** (candidate for a tiny migration). |
| `auth_db_connections_absolute` | 1 | INFO | Connection-pool strategy config note. |

**Interpretation:** no finding blocks go-live. At ~8 users / small tables the query cost is trivial. These form a **scalability backlog** to address as data volume grows (esp. `auth_rls_initplan` wrapping + selective FK indexes). Recommend NOT mass-rewriting RLS pre-go-live (risk > reward now).

## Storage
5 buckets — `documents`, `attendance`, `face-refs`, `invoice-pdfs` **private** (policies enforced); `avatars` public (low-sensitivity profile pics). ✅ No sensitive bucket public.

## Authentication / Security (from PR3)
✅ Password-only login (no camera), brute-force lockout, 15-min idle logout + 13-min warning, refresh-race fixed, RLS everywhere, sensitive RPCs guarded. ⚠️ **Prod still needs:** the PR3 hotfix (RPC revokes 100/101), disable public sign-ups, leaked-password protection — see `PROD_SECURITY_HOTFIX_PACKAGE.md`.

## Build / Testing
✅ `npm run build` (`tsc -b && vite build`) clean; `vitest` **34/34**; ESLint **0 errors** (554 accepted warnings). CI (`deploy.yml`) runs typecheck+test+build on `main`. Bundle: entry ~13 kB gz + split vendors (PR2); `xlsx` async.

## Data
Master data present (staging test set: 8 employees, 3 clients, 2 projects). ⚠️ **Production master-data reconciliation** (GSTIN→PAN→Email→Mobile→Name) + historical invoice import (GetSwipe) are a separate **Data Validation** workstream (program §Data Validation) — to be planned before go-live.

## Readiness signal (preliminary — full Go/No-Go in the Final Audit)
- **Security/correctness:** ✅ production-grade (staging); prod hotfix pending.
- **Performance:** ✅ adequate for launch scale; scalability backlog documented.
- **Build/test:** ✅ green.
- **Open before go-live:** (1) apply prod security hotfix, (2) confirm prod backups/PITR, (3) data reconciliation + invoice import, (4) prod migration-drift capture, (5) RoleBasedRedirect landing decision (PR4 debt).

## Next (Phase 2)
Produce the 8 production checklists: Deployment, Rollback, DB Backup, Restore, Go-Live, Support, UAT, Deployment Validation.
