# Wave 1 — As-Built Record (Single Source of Truth)

**This document describes EXACTLY what shipped in Wave 1.** Where the module design docs
(`modules/administration.md`, `modules/documents.md`, `modules/knowledge.md`) describe the fuller
target design, THIS document is authoritative for what actually exists in the codebase and staging
database as of the `wave-1` tag. Later waves extend the design; they have not shipped.

Read the SQL in `supabase/migrations/078`–`081` and the code under `src/core/*` and `src/modules/*`
alongside this record — every table, column, RPC, permission key, route, and nav entry below is
transcribed from those files, not from the design intent.

---

## 1. Summary

| Field | Value |
|---|---|
| Modules delivered | **Administration**, **Document Management**, **Knowledge Base** (+ **Core access** layer & module registry) |
| Commit | `2546143` — *feat(wave-1): Administration + Document Management + Knowledge Base (additive)* |
| Tag | `wave-1` (annotated); branch `staging` |
| DB migrations | `078_admin_permission_registry`, `079_document_management`, `080_knowledge_base`, `081_my_permissions_rpc` |
| Migrations applied to | Staging Supabase `gytscakgtsbxgdkbqhbx` **only** (production untouched) |
| Build | ✅ green — `tsc -b && vite build`; routes lazy-loaded (initial bundle ~478 KB) |
| Tests / typecheck | ✅ `vitest run` 5/5; `tsc --noEmit` clean |
| Validation | ✅ existing login/dashboard/projects intact; new Roles & Permissions matrix, Documents hub, Audit Log render; zero console errors |
| Backward compatibility | ✅ every change **additive** (EXPAND step only) — see §9 |
| Production impact | None. `main` / GitHub Pages untouched. |

Delivery step per the Constitution: **EXPAND only** — nothing migrated, switched, or removed. The
grant-based permission layer was seeded from current state so runtime behaviour is identical today.

Rollback baseline & procedure: see [`WAVE1_MILESTONE.md`](WAVE1_MILESTONE.md).

---

## 2. Database migrations 078–081

All four migrations are **additive and backward-compatible**: new tables/columns/views/functions
only, `create table if not exists` / `add column if not exists`, no data migration, no destructive
change. The existing `user_role` enum, `has_role()` / `auth_role()`, `profiles.role`, and all
`allowedRoles` guards keep working unchanged.

### 078 — Administration: grant-based permission registry

Tables created (all with RLS enabled):

| Table | Key columns |
|---|---|
| `organizations` | `id uuid pk`, `org_key text unique`, `legal_name text`, `gstin`, `pan`, `address`, `is_active bool`, `created_at`, `updated_at` |
| `roles` | `role_key text pk`, `label text`, `role_type text ('base'\|'functional')`, `maps_to_base user_role`, `is_system bool`, `sort_order int`, `created_at` |
| `user_roles` | `user_id uuid → profiles`, `role_key text → roles`, `granted_by uuid`, `granted_at`; **pk (user_id, role_key)** |
| `permissions` | `perm_key text pk`, `module text`, `label text`, `is_system bool`, `created_at` |
| `role_permissions` | `role_key → roles`, `perm_key → permissions`, `scope text ('own'\|'team'\|'all') default 'all'`; **pk (role_key, perm_key)** |
| `user_permission_overrides` | `user_id → profiles`, `perm_key → permissions`, `granted bool`, `scope text`; **pk (user_id, perm_key)** |
| `delegations` | `id uuid pk`, `from_user`, `to_user`, `scope_note`, `valid_from`, `valid_to`, `created_by`, `created_at`; `check (valid_to > valid_from)` |
| `notification_types` | `type_key text pk`, `label text`, `default_channels text[]` |
| `org_number_series` | `series_key text pk`, `org_id → organizations`, `prefix text`, `next_seq bigint`, `updated_at` |
| `consent_records` (DPDP) | `id`, `subject_type`, `subject_id`, `purpose`, `basis default 'consent'`, `granted bool`, `granted_at`, `revoked_at`, `recorded_by` |
| `data_subject_requests` (DPDP) | `id`, `subject_type`, `subject_id`, `kind ('access'\|'erasure'\|'rectification'\|'portability')`, `status ('open'\|'in_progress'\|'fulfilled'\|'rejected')`, `detail`, `requested_at`, `handled_by`, `handled_at` |

Also creates the RPC **`has_perm(p_key text, p_scope text default 'all')`** (see §3).

**Seeding:**
- `organizations`: `('tps_xperts_group', 'TPS Xperts Group')`.
- `roles`: 7 base roles seeded to mirror the enum — `super_admin`, `director`, `manager`,
  `executive`, `accounts`, `hr`, `auditor` (each `role_type='base'`, `maps_to_base` = same enum value).
- `user_roles`: seeded **from `profiles.role`** (`insert … select id, role::text from profiles`) — every
  existing user gets a grant matching their current enum role.
- `permissions`: the starter set (see §3 for the exact keys).
- `role_permissions`: director + super_admin get **all** permissions at scope `all`; managers get
  documents view/upload/export + knowledge view/author/publish + `admin.audit.view` (team); executive/
  accounts/hr/auditor get `knowledge.article.view` (all); executive/accounts/hr get `documents.doc.view`
  (own); auditor gets `documents.doc.view` (all) + `admin.audit.view` (all).
- `notification_types`: seeded from the existing `notification_type` enum range.

**RLS (078):** every registry table — read policy `for select` where `auth.uid() is not null` (any
authenticated user may read the reference data / their own grants); write policy `for all` gated by
the existing `has_role(VARIADIC ['super_admin','director'])`. `has_perm()` is `SECURITY DEFINER`, so it
reads these tables safely regardless of the caller's RLS.

### 079 — Document Management

| Object | Key columns |
|---|---|
| `folders` (table) | `id`, `name`, `parent_id → folders (on delete cascade)`, `entity_type`, `entity_id`, `drive_folder_id`, `created_by`, `created_at` |
| `documents.folder_id` (column) | `add column if not exists folder_id uuid → folders` on the **existing** `documents` table |
| `document_versions` (table) | `id`, `document_id → documents (cascade)`, `version int`, `storage_path`, `drive_file_id`, `file_name`, `size_bytes bigint`, `uploaded_by`, `uploaded_at`, `note`; `unique (document_id, version)` |
| `document_templates` (table) | `id`, `name`, `category`, `storage_path`, `body`, `merge_fields jsonb default '[]'`, `is_active bool`, `created_by`, `created_at`, `updated_at` |
| `v_all_documents` (view) | `security_invoker = true`; unified read over 3 sources (see below) |

`v_all_documents` is a `union all` over the three existing document tables, projecting a common shape
`(id, source, entity_type, entity_id, folder_id, doc_type, file_name, storage_path, file_size_bytes,
version, is_current, uploaded_by, created_at)`:
- `documents` → `source='documents'`, entity_type derived from `project_id`/`client_id`, `is_current = is_latest`.
- `client_documents` → `source='client_documents'`, entity `client`, version `1`, current `true`.
- `stage_documents` → `source='stage_documents'`, entity `stage`, version `version_no`, current `true`.

**RLS (079):** `folders`, `document_versions`, `document_templates` — read where `auth.uid() is not
null`; write `for all` gated by `auth_role() = any([super_admin, director, manager, executive,
accounts, hr])`.

### 080 — Knowledge Base

| Object | Key columns |
|---|---|
| `kb_categories` (table) | `id`, `name`, `slug text unique`, `parent_id → kb_categories (on delete set null)`, `sort_order int`, `created_at` |
| `knowledge_base` (added columns) | `category_id uuid → kb_categories`, `reviewed_by uuid → profiles`, `published_at timestamptz`, `client_visible boolean default false` |
| `kb_article_versions` (table) | `id`, `article_id → knowledge_base (cascade)`, `version int`, `title`, `content`, `edited_by`, `edited_at`; `unique (article_id, version)` |
| `kb_article_feedback` (table) | `id`, `article_id → knowledge_base (cascade)`, `user_id → profiles`, `helpful boolean`, `comment text`, `created_at` |

Existing `knowledge_base` columns (`category text`, `tags[]`, `is_published`) are **kept**; the new
columns are additive.

**RLS (080):** `kb_categories`, `kb_article_versions` — read where `auth.uid() is not null`; write
gated by `auth_role() = any([super_admin, director, manager])`. `kb_article_feedback` — read where
`auth.uid() is not null`; **insert** allowed where `user_id = auth.uid()` (any authenticated user may
leave their own feedback).

### 081 — `my_permissions()` RPC

Adds the RPC **`my_permissions() returns table(perm_key text, scope text)`** (`SECURITY DEFINER`),
which returns the caller's effective permission set for the frontend `useCan()` hook (one cached call).
See §3.

---

## 3. Grant-based permission framework (as-built)

The framework is the set of 078 tables + two RPCs. It runs **alongside** the existing `user_role`
enum + `has_role()` — nothing was switched or removed; both are live.

**Entities:** `roles`, `user_roles`, `permissions`, `role_permissions` (with `scope own|team|all`),
`user_permission_overrides` (per-user grant/deny + scope), `delegations` (time-boxed).

**RPC `has_perm(p_key, p_scope='all')`** (`SECURITY DEFINER`, `stable`) resolves, in order:
1. **super_admin hard floor** — a user with the `super_admin` role grant returns `true` for everything.
2. **user override** — `user_permission_overrides.granted` for the key.
3. **role grant** over the *effective role set*, honouring scope: `own` matches any scope; `team`
   matches `team`/`all`; `all` matches `all`.

The **effective role set** = the caller's own `user_roles` **plus** the roles of anyone with an active
`delegations` row (`to_user = me AND now() BETWEEN valid_from AND valid_to`) — the delegate inherits
the delegator's grants for the window.

**RPC `my_permissions()`** returns `(perm_key, scope)` for the caller: super_admin ⇒ every permission at
`all`; otherwise the max scope per key across effective roles, with overrides applied (granted overrides
add/raise; `granted=false` overrides remove the key).

**Exact permission keys seeded (migration 078):**

| Module | Keys |
|---|---|
| administration | `admin.user.view`, `admin.user.manage`, `admin.role.manage`, `admin.setting.manage`, `admin.audit.view`, `admin.privacy.manage`, `admin.entity.view` |
| documents | `documents.doc.view`, `documents.doc.upload`, `documents.doc.delete`, `documents.doc.export`, `documents.template.manage` |
| knowledge | `knowledge.article.view`, `knowledge.article.author`, `knowledge.article.publish`, `knowledge.category.manage` |

> Note: the DB seeds the full `admin.*` set (7 keys). The Administration module's `permissions.ts`
> currently declares the 4 keys wired to shipped UI (`admin.user.manage`, `admin.role.manage`,
> `admin.audit.view`, `admin.privacy.manage`). The remaining seeded keys exist server-side for later UI.

---

## 4. Document Management (as-built)

**Tables/objects:** `folders`, `document_versions`, `document_templates`, the added `documents.folder_id`
column, and the `v_all_documents` union view (see §2/079 for columns and RLS).

**Pages shipped:** `DocumentsHubPage` (unified list over `v_all_documents`), `TemplatesPage`
(`document_templates` CRUD). **API:** `documents.ts` reads `v_all_documents` and joins `profiles` for
uploader names; `templates.ts` CRUDs `document_templates`. `useAllDocuments` / `useTemplates` hooks.

---

## 5. Knowledge Base (as-built)

**Tables/objects:** `kb_categories`, `kb_article_versions`, `kb_article_feedback`, and the four added
`knowledge_base` columns (`category_id`, `reviewed_by`, `published_at`, `client_visible`) — see §2/080.

**Pages shipped:** `KnowledgeHubPage` (browse), `ArticleViewPage` (`:id`), `CategoriesAdminPage`
(category management). **API:** `kb.ts` reads/writes `knowledge_base`, `kb_categories`,
`kb_article_versions`, `kb_article_feedback`. `useKnowledge` hooks. The existing `/knowledge`
(`KnowledgePage`) page is untouched and still owned by `App.tsx`.

---

## 6. Core access layer

`src/core/access/useCan.ts` adds three additive hooks over `my_permissions()`:
- **`useMyPermissions()`** — fetches the effective permission map once via `supabase.rpc('my_permissions')`,
  cached (React Query, `staleTime` 5 min) keyed by user id; returns `Record<perm_key, scope>`.
- **`useCan(permKey, scope='own')`** — boolean; true iff the held scope rank ≥ requested. **Fail-closed**
  while loading (returns `false`).
- **`useCanFn()`** — returns a predicate `(permKey, scope) => boolean` for checking many keys without
  multiple hook calls.

Scope ranking: `own(1) < team(2) < all(3)`. Public API re-exported from `src/core/access/index.ts`
alongside the **unchanged** V1 guards `ProtectedRoute`, `RoleGuard`, `RoleBasedRedirect`.

---

## 7. Module & Route Registry

`src/core/moduleTypes.ts` defines the `ModuleDef` contract (`key`, `nav: NavEntry[]`, `routes:
RouteObject[]`, `permissions: string[]`). `src/core/registry.ts` composes the modules:

```
MODULES = [ operationsModule, administrationModule, documentsModule, knowledgeModule ]
```

Helpers: **`getAllRoutes()`** (flattens every module's routes), **`getNavFor(role)`** (nav entries
visible to a role; entries without `roles` are visible to all), **`getAllPermissions()`** (all module
permission keys).

`src/App.tsx` mounts module routes via `getAllRoutes().map(...)` inside the protected `AppShell`
parent. Existing hardcoded routes (`/admin/users`, `/knowledge`, `/settings`, etc.) remain for
backward compatibility — modules only add **new** routes.

**Actual module route paths (relative to the protected `/` shell):**

| Module | Paths |
|---|---|
| administration | `admin/roles`, `admin/audit`, `admin/privacy` (each wrapped in `ProtectedRoute allowedRoles=['super_admin','director']`) |
| documents | `documents`, `documents/templates` (wrapped in `ProtectedRoute`; finer access via `useCan` + RLS) |
| knowledge | `knowledge/browse`, `knowledge/article/:id`, `knowledge/categories` (wrapped in `ProtectedRoute`) |

The existing `/admin/users` and `/knowledge` routes are **not** re-declared by the modules — only
referenced from nav.

---

## 8. Sidebar additions

Three entries were added to the existing `NAV` array in `src/components/layout/Sidebar.tsx`
(role-gated to `['super_admin','director']`); all pre-existing entries are unchanged:

- **Roles & Access** → `/admin/roles` (icon `shield_person`)
- **Audit Log** → `/admin/audit` (icon `history`)

`Documents` → `/documents` (icon `folder_open`) is present in the sidebar NAV (visible to all internal
roles). Each Wave-1 module also ships its own `nav.ts` (`administrationNav`, `documentsNav`,
`knowledgeNav`) exposed through the registry via `getNavFor()` for registry-driven navigation; the
current live sidebar renders from the static `NAV` array.

---

## 9. Backward-compatibility statement

Every Wave-1 change is additive (EXPAND step only):

- **Enum & helpers:** the `user_role` enum, `has_role()`, and `auth_role()` are untouched and still
  authoritative for existing guards. The grant layer was seeded from `profiles.role`, so effective
  access is identical today.
- **Tables:** no existing table was altered destructively — only `documents.folder_id` and four
  `knowledge_base` columns were **added** (`if not exists`); all existing columns/data preserved.
- **URLs/routes/guards:** all existing routes (`/admin/users`, `/knowledge`, `/settings`, `/director`,
  operations, etc.) and their `allowedRoles` guards are unchanged; modules only add new paths.
- **RLS:** new tables get their own policies; existing policies are unchanged.
- **Frontend:** V1 `ProtectedRoute` / `RoleGuard` / `RoleBasedRedirect` are unchanged; `useCan()` is a
  new, optional, additive check.

Rollback is trivial: `git checkout wave-1` for code; drop the added objects for the (staging-only) DB —
nothing was switched or removed.
