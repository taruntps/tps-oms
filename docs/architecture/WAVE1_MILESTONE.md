# Wave 1 — Milestone & Rollback Point (FROZEN)

**Status:** ✅ APPROVED & FROZEN. This is the rollback baseline before Wave 2.

| Field | Value |
|---|---|
| Git tag | `wave-1` (annotated) |
| Branch | `staging` |
| Commit ID | `2546143bcf88815835f317c48c944ab325b36075` (`2546143`) |
| Modules delivered | Administration, Document Management, Knowledge Base (+ Core access layer) |
| DB migrations | `078_admin_permission_registry`, `079_document_management`, `080_knowledge_base`, `081_my_permissions_rpc` |
| Migrations applied to | Staging Supabase `gytscakgtsbxgdkbqhbx` only (production untouched) |
| Build | ✅ green — `tsc -b && vite build`, initial bundle ~478 KB (routes lazy-loaded) |
| Tests | ✅ 5/5 (`vitest run`) |
| Type check | ✅ `tsc --noEmit` clean |
| Validation | ✅ login + dashboard + projects (existing workflows intact); Roles & Permissions matrix, Documents hub, Audit Log (new) render; **zero console errors** |
| Backward compatibility | ✅ existing `user_role` enum, `has_role()`, all existing routes/URLs/guards/tables unchanged; every change additive (EXPAND step only) |
| Production impact | None. `main` / GitHub Pages untouched. |

## Rollback procedure (if ever needed, before Wave 2 merges)
- **Code:** `git checkout wave-1` (or reset a branch to `2546143`).
- **Database (staging):** migrations 078–081 are purely additive (new tables/columns/functions, no data migration, no destructive change). To roll back, drop the added objects; existing data and the V1 schema are unaffected because nothing was switched or removed.

## What shipped — see the as-built record
Full as-built detail (tables, columns, RPCs, permission keys, modules, routes, sidebar) is in
[`03_WAVE1_AS_BUILT.md`](03_WAVE1_AS_BUILT.md), the single source of truth for the Wave-1 implementation.
