# Module Design — Administration

**Module #15 · Anchor entities:** User, Role, Permission, Setting, Integration, Audit event
**Primary users:** Super Admin, Directors (read-mostly for HR on user lifecycle)
**Status:** Design (Phase D). Formalizes existing V1 admin surfaces (User Management, Settings, Vault, reminder/notification controls) into a first-class module.
**Governs:** the platform-wide **permission registry** — every other module's permission keys roll up here into an assignable role × permission matrix.

> Follows the §6 template of `00_ENTERPRISE_ARCHITECTURE.md` verbatim. Permission keys for this module are namespaced `admin.<entity>.<action>`.

---

## 1. Purpose & scope

**Business capability.** Administration is the platform's control plane. It owns *who can use the system, what they can do, how the organization (and any future branches) is configured, which external services are wired in, and the forensic record of security-relevant actions.* It is the only module allowed to mutate the identity, permission, settings, and integration surfaces that every other module depends on.

**Who uses it.**
- **Super Admin** — full control: user lifecycle, role/permission matrix, integration secrets, feature flags, retention policy, security event review.
- **Directors** — most admin views (users, audit, security events, settings) read/write, but *cannot* rotate integration secrets or change retention policy unless also super_admin. Two-person-integrity for the most destructive knobs.
- **HR** (delegated) — may create/deactivate *employee* accounts through a scoped grant, but never assign privileged roles or touch integrations.

**In scope.**
1. **User lifecycle** — invite (email magic-link), create-with-password (code-only staff), deactivate/reactivate, admin password reset, role assignment, employee-code management.
2. **Roles & granular permissions** — the permission *registry* (all 15 modules' keys), a role → permission matrix, and per-user overrides (allow/deny on top of role).
3. **Organization / entity settings** — the organization — TPS Xperts Group (consultancy) — and any future entities/branches: legal name, GSTIN/PAN, addresses, invoice series, logo, signatories. `organizations` is **the single legal-entity master** for the whole platform (Finance's proposed `legal_entities` is retired and references this), and Administration hosts **the single Core numbering service** that owns every document series (invoice / receipt / deal / order / project).
4. **Integration configuration** — Razorpay, ZeptoMail, **SMS gateway (MSG91/Gupshup/Twilio)**, WhatsApp BSP (AiSensy), Google (Drive/Sheets), Anthropic. Secrets in **Vault**; non-secret config + enable toggles in `app_settings`/`integrations`.
5. **Feature flags** — formalize the `*_enabled` toggles (e.g. `whatsapp_enabled`, `face_match_enabled`) into a typed, audited registry.
6. **Audit log & security events** — a viewer over the append-only `audit_log`, plus `login_attempts` and `credential_access_log` (credential reveal / FSSAI portal access).
7. **Data retention / backup policy** — declarative retention windows per data class; visibility of Supabase PITR/backup status; export-before-purge.
8. **System health & release info** — DB/Edge/cron heartbeat, migration head, app version/build, integration reachability.
9. **Notification / reminder settings** — the global `reminder_settings` singleton + per-channel controls (already partly built).
10. **Consent & data-subject rights (DPDP Act 2023)** — a **consent register** (purpose, lawful basis, timestamp, subject) and a **data-subject-request** workflow (access / erasure). The platform holds heavy client PII plus **biometric face data** (face-match attendance), so this is a first-class Administration sub-domain, not an afterthought.

**Explicitly NOT in scope (belongs elsewhere).**
- Business data CRUD (clients, projects, invoices) — owned by their modules.
- Notification *delivery* — Administration owns the *toggles*; `core/notifications` owns dispatch.
- Employee HR records (leave, payroll, attendance) — HRMS. Administration only owns the *auth identity* and role/permission layer that a profile carries.
- Defining new permission *keys* — each module declares its own keys in `modules/<x>/permissions.ts`; Administration only **aggregates and assigns** them.
- Secret cryptography — delegated to Supabase **Vault**; Administration never stores plaintext secrets in its own tables.

---

## 2. Business workflow

TPS's real admin operations, as numbered end-to-end flows.

### 2.1 Onboard a new staff member
1. Super Admin (or delegated HR) opens **Users → New**.
2. Chooses entity, name, role, and either an **email** (email-capable staff → invite flow) or an **Employee Code** (field staff without email → create-with-password flow, synthetic `t007@emp.tpsxpert.com` login).
3. For email: `invite-user` Edge Function sends a magic-link (ZeptoMail); the user sets their own password. For code: `admin_create_user` RPC creates auth user + identity + profile atomically with a temp password.
4. Admin sets granular flags (`can_be_assigned`, `can_assign`, `can_view_all_projects`) and any per-user permission overrides.
5. `audit_log` records `user_create`; a welcome notification fires (gated by settings).

### 2.2 Adjust what a role can do (permission matrix)
1. Admin opens **Roles & Permissions → Matrix**.
2. The matrix renders **every permission key from all 15 modules** (rows) × **roles** (columns), pulled from the aggregated registry.
3. Admin toggles a cell (e.g. grant `finance.invoice.void` to `accounts`). Change writes `role_permissions` and stamps `audit_log`.
4. Effective permissions recompute; affected users' UI affordances update on next token refresh; **RLS enforces the new grant immediately** in the DB.

### 2.3 Deactivate an offboarded user
1. Admin opens the user, clicks **Deactivate**.
2. `profiles.is_active = false`; `admin_revoke_sessions` invalidates refresh tokens (existing behavior of the reset path); pending assignments flagged for reassignment.
3. `audit_log` records `user_deactivate`. Data is retained per retention policy — never hard-deleted here.

### 2.4 Wire up / rotate an integration
1. Super Admin opens **Integrations → Razorpay** (or ZeptoMail/WhatsApp/Google/Anthropic).
2. Enters the secret; it goes straight to **Vault** via `admin_set_integration_secret` (service-definer). Only the Vault **reference** + non-secret config land in `integrations`.
3. Admin runs **Test connection** (Edge Function pings the provider with the Vault secret). Result + `last_verified_at` stored.
4. Toggle **Enable**. `audit_log` records `integration_update` (secret value never logged).

### 2.5 Review a security event
1. Admin opens **Security → Events**, filters by type (failed login, credential reveal, permission change, secret access).
2. Drills into a `login_attempts` spike or a `credential_access_log` reveal → sees actor, IP, reason, timestamp.
3. Optionally deactivates the actor or forces a password reset.

```mermaid
flowchart TD
  A[Admin need] --> B{Which surface?}
  B -->|New person| C[Users: invite or create]
  C --> C1[invite-user / admin_create_user]
  C1 --> C2[Set flags + overrides]
  C2 --> Z[audit_log + notify]
  B -->|Change capability| D[Roles & Permissions matrix]
  D --> D1[Toggle role_permissions cell]
  D1 --> D2[Recompute effective perms]
  D2 --> Z
  B -->|Offboard| E[Deactivate user]
  E --> E1[is_active=false + revoke sessions]
  E1 --> Z
  B -->|External service| F[Integrations]
  F --> F1[Secret to Vault + config to integrations]
  F1 --> F2[Test connection]
  F2 --> Z
  B -->|Investigate| G[Security events viewer]
  G --> G1[login_attempts / credential_access_log]
  G1 --> G2{Action?}
  G2 -->|Yes| E
  G2 -->|No| Z
  Z --> H([Done])
```

---

## 3. Screen flow

```mermaid
stateDiagram-v2
  [*] --> AdminHome
  AdminHome --> Users
  AdminHome --> Roles
  AdminHome --> Entities
  AdminHome --> Integrations
  AdminHome --> FeatureFlags
  AdminHome --> Security
  AdminHome --> Retention
  AdminHome --> Health
  AdminHome --> Notifications

  Users --> UserDetail
  UserDetail --> UserPermsOverride
  UserDetail --> Users : save
  Roles --> RoleMatrix
  RoleMatrix --> Roles : save
  Integrations --> IntegrationDetail
  IntegrationDetail --> Integrations : test/save
  Security --> AuditLogView
  Security --> LoginAttemptsView
  Security --> CredentialAccessView
  Entities --> EntityDetail
  Retention --> RetentionPolicy
  Notifications --> ReminderSettings
```

**Screen inventory.**

| Route | Screen | Purpose | Guard (permission) |
|---|---|---|---|
| `/admin` | Admin Home | KPI tiles + quick links | `admin.console.view` |
| `/admin/users` | Users list | Search/filter, status, role, entity | `admin.user.view` |
| `/admin/users/:id` | User detail | Edit role, flags, reset password, deactivate | `admin.user.edit` |
| `/admin/users/:id/permissions` | Per-user overrides | Allow/deny specific keys on top of role | `admin.permission.assign` |
| `/admin/roles` | Roles list | The 7 roles + descriptions | `admin.role.view` |
| `/admin/roles/matrix` | **Permission matrix** | All 15 modules' keys × roles, togglable | `admin.permission.assign` |
| `/admin/entities` | Entities list | Organization + future branches | `admin.entity.view` |
| `/admin/entities/:id` | Entity detail | Legal/tax/invoice/signatory config | `admin.entity.edit` |
| `/admin/integrations` | Integrations | Razorpay/ZeptoMail/WhatsApp/Google/Anthropic | `admin.integration.view` |
| `/admin/integrations/:key` | Integration detail | Secret (Vault), config, test, toggle | `admin.integration.manage` |
| `/admin/flags` | Feature flags | Typed toggles registry | `admin.flag.manage` |
| `/admin/settings` | App & reminder settings | Global settings + digest hour | `admin.settings.edit` |
| `/admin/security` | Security overview | Events summary | `admin.security.view` |
| `/admin/security/audit` | Audit log viewer | Filter who/what/when/before/after | `admin.audit.view` |
| `/admin/security/logins` | Login attempts | Failed/successful, IP, throttle state | `admin.security.view` |
| `/admin/security/credentials` | Credential access | FSSAI reveal / Vault reads | `admin.security.view` |
| `/admin/retention` | Retention & backup | Windows per data class, backup status | `admin.retention.manage` |
| `/admin/health` | System health | DB/Edge/cron/migration/version | `admin.health.view` |

---

## 4. Database design

New tables introduced by this module are prefixed conceptually as the "admin/identity control plane." Existing tables (`profiles`, `app_settings`, `reminder_settings`, `audit_log`, `credential_access_log`, `whatsapp_log`, `notification_log`) are **reused as-is** and only *extended additively* (expand-contract).

```mermaid
erDiagram
  organizations ||--o{ profiles : "employs"
  organizations ||--o{ org_number_series : "owns"
  profiles ||--o{ user_roles : "granted"
  roles ||--o{ user_roles : "assigned via"
  profiles ||--o{ user_permission_overrides : "has"
  profiles ||--o{ delegations : "delegates from"
  profiles ||--o{ delegations : "delegated to"
  profiles ||--o{ audit_log : "acts in"
  profiles ||--o{ login_attempts : "attempts"
  profiles ||--o{ credential_access_log : "reads"
  profiles ||--o{ consent_records : "subject of"
  profiles ||--o{ data_subject_requests : "raises"
  roles ||--o{ role_permissions : "granted"
  permissions ||--o{ role_permissions : "in"
  permissions ||--o{ user_permission_overrides : "overrides"
  modules ||--o{ permissions : "declares"
  integrations ||--o{ integration_events : "logs"
  feature_flags ||--o{ audit_log : "changes tracked"
  retention_policies ||--o{ retention_runs : "executed by"

  organizations {
    uuid id PK
    text code "org | branch"
    text legal_name
    text trade_name
    text gstin
    text pan
    text address
    text logo_path
    jsonb signatories
    boolean is_active
  }
  org_number_series {
    uuid id PK
    uuid org_id FK
    text doc_type "invoice|receipt|deal|order|project"
    text prefix
    int next_number
    int fiscal_year
  }
  roles {
    text role_key PK "base + functional sub-roles"
    text label
    text description
    text role_type "base | functional"
    text maps_to_base "platform role a functional role inherits"
    boolean is_system "cannot delete"
    int rank "privilege ordering"
  }
  user_roles {
    uuid id PK
    uuid user_id FK
    text role_key FK
    uuid granted_by
    timestamptz created_at
  }
  modules {
    text key PK "operations..administration"
    text label
    boolean is_enabled
  }
  permissions {
    text key PK "module.entity.action"
    text module_key FK
    text entity
    text action
    text label
    boolean is_dangerous
  }
  role_permissions {
    text role_key FK
    text permission_key FK
    boolean granted
    text scope "own | team | all"
    uuid updated_by
    timestamptz updated_at
  }
  user_permission_overrides {
    uuid id PK
    uuid user_id FK
    text permission_key FK
    text effect "allow | deny"
    text scope "own | team | all"
    uuid granted_by
    timestamptz created_at
  }
  delegations {
    uuid id PK
    uuid from_user FK
    uuid to_user FK
    text scope "own | team | all"
    text permission_key "null = all delegator perms"
    timestamptz valid_from
    timestamptz valid_to
    uuid created_by
    boolean is_active
  }
  profiles {
    uuid id PK
    text name
    text email
    user_role role "legacy enum — backward-compat only, grants live in user_roles"
    uuid org_id FK
    text employee_code
    boolean is_active
    boolean can_be_assigned
    boolean can_assign
    boolean can_view_all_projects
    jsonb report_permissions
  }
  integrations {
    text key PK "razorpay..anthropic"
    text label
    boolean is_enabled
    text vault_secret_id "Vault reference only"
    jsonb config "non-secret"
    text last_verified_status
    timestamptz last_verified_at
    uuid updated_by
  }
  integration_events {
    uuid id PK
    text integration_key FK
    text event "verify|rotate|enable|disable"
    text status
    jsonb meta
    timestamptz created_at
  }
  feature_flags {
    text key PK "whatsapp_enabled.."
    text label
    boolean value
    text stage_value "override on staging"
    text description
    uuid updated_by
    timestamptz updated_at
  }
  retention_policies {
    text data_class PK "audit|notification|whatsapp_log|login_attempts.."
    int retain_days
    boolean export_before_purge
    boolean is_active
  }
  retention_runs {
    uuid id PK
    text data_class FK
    int rows_purged
    text export_path
    timestamptz ran_at
  }
  login_attempts {
    uuid id PK
    text email_or_code
    uuid user_id FK
    boolean success
    text ip_address
    text user_agent
    text failure_reason
    timestamptz created_at
  }
  audit_log {
    uuid id PK
    uuid user_id FK
    text action
    text table_name
    uuid record_id
    jsonb old_data
    jsonb new_data
    text ip_address
    timestamptz created_at
  }
  credential_access_log {
    uuid id PK
    uuid license_id
    uuid accessed_by FK
    text ip_address
    text reason
    timestamptz accessed_at
  }
  notification_types {
    text key PK "user_invited.."
    text label
    text default_channels "email|in-app|sms|whatsapp"
    text owning_module
    boolean is_active
  }
  consent_records {
    uuid id PK
    uuid subject_user_id FK
    text purpose "face_biometric|marketing|.."
    text lawful_basis
    boolean granted
    text source
    timestamptz captured_at
    timestamptz revoked_at
  }
  data_subject_requests {
    uuid id PK
    uuid subject_user_id FK
    text request_type "access | erasure | rectification"
    text status "received|in_progress|fulfilled|rejected"
    uuid handled_by
    text export_path
    timestamptz requested_at
    timestamptz resolved_at
  }
```

**Key design notes.**
- **Decoupled role-grant model (replaces the flat enum as the source of truth).** The flat 7-value `user_role` enum is insufficient: module docs already reference *functional* roles that don't exist in it (certification sub-roles, marketing exec/manager, L&D admin/instructor, procurement). Because RLS depends on the enum, "adding a role" is really an **enum migration** — too heavy. Resolution:
  - **`roles`** is keyed by string `role_key` and holds both **base platform roles** (`super_admin..auditor`) and **functional sub-roles**, each `role_type = base | functional` with a `maps_to_base` so a functional role inherits a platform role's floor.
  - **`user_roles`** is a many-to-many grant (`user_id × role_key`) — a user can hold several roles. This is the authoritative grant source.
  - **`has_role()` reads `user_roles` grants, not the enum.** The `user_role` enum is kept **only for backward-compat** during expand-contract (existing columns/policies keep working until every reader moves to the grant model); it is no longer extended for new roles.
  - **Functional → platform mapping** is documented in `roles.maps_to_base`, so RLS that still checks a base role keeps working while functional roles carry finer permission grants.
- **`permissions` is the registry** — one row per key `module.entity.action`, populated by syncing `MODULES[].permissions` from `core/registry.ts` (see §5). This is the join target that makes an *assignable* matrix possible.
- **Data scope is a first-class dimension.** A boolean role×permission grant can't express *whose* rows a holder may touch, so **`role_permissions.scope`** and **`user_permission_overrides.scope`** carry `own | team | all`. `has_perm(key, scope)` consumes it; the admin matrix renders the **effective scope** per cell (not just a checkbox).
- **`role_permissions`** is the base grant matrix (role × permission × scope). **`user_permission_overrides`** layers per-user `allow`/`deny` (also scoped) on top. Effective permission = role grant, then override wins (`deny` beats `allow` beats role); the tightest applicable scope wins.
- **`delegations`** models a **time-boxed acting-manager** grant (`from_user → to_user`, optional `permission_key`, `scope`, `valid_from/valid_to`). Resolved inside `has_perm` so approvals don't stall when a HOD/director travels; every grant and every delegated authorization is audited.
- **`org_number_series`** (generalized from the old invoice-only series) is the **single numbering owner** for all document series across the platform — invoice / receipt / deal / order / project — so no module mints its own sequence. `organizations` is the **single legal-entity master**; Finance's `legal_entities` is retired and FKs here.
- **`notification_types` lookup replaces the platform-wide enum.** Rather than every module `ALTER`-ing a shared `notification_type` enum, types are rows in `notification_types` (key, label, default channels, owning module) — additive by insert, no migration churn.
- **`consent_records` + `data_subject_requests`** back the DPDP sub-domain: consent register (purpose, lawful basis, granted/revoked timestamps) and the access/erasure/rectification request workflow, covering client PII and biometric face data.
- **`profiles.org_id`** (new, nullable, additive) ties a user to one of the two entities. Existing granular flag columns (`can_be_assigned`, `can_assign`, `can_view_all_projects`, `report_permissions`) are retained; the permission registry *supersedes* them over time but they remain during coexistence (expand-contract; contract only after all RLS reads move to `has_perm()`).
- **`integrations`** never stores plaintext — only `vault_secret_id` + non-secret `config`. Mirrors the existing FSSAI-credential Vault pattern (`vault.create_secret` → store reference).
- **`feature_flags`** formalizes today's `app_settings` `*_enabled` rows into a typed table with a **`stage_value`** so staging stays sandboxed independent of prod (aligns with the staging-environment memory).
- **Append-only tables** keep their `no_update`/`no_delete` rules: `audit_log`, `credential_access_log`. `login_attempts` is insert-only + purge-by-retention.

**RLS intent per table.**

| Table | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| `organizations` | `admin.entity.view` | `admin.entity.edit` (super_admin/director) |
| `roles` | authenticated (labels needed by UI) | `admin.role.manage` (super_admin) |
| `user_roles` | self + `admin.user.view` | `admin.role.manage` (super_admin) + rank guard |
| `modules` | authenticated | super_admin only |
| `permissions` | authenticated (UI renders matrix) | service/seed only (registry sync) |
| `role_permissions` | authenticated (drives affordances) | `admin.permission.assign` (super_admin) |
| `user_permission_overrides` | self + `admin.permission.assign` | `admin.permission.assign` |
| `delegations` | self (from/to) + `admin.permission.assign` | `admin.permission.assign`; audited |
| `notification_types` | authenticated | super_admin / service (seed) |
| `consent_records` | self (subject) + `admin.privacy.manage` | self-service consent + `admin.privacy.manage` |
| `data_subject_requests` | self (subject) + `admin.privacy.manage` | self raise; `admin.privacy.manage` to fulfil |
| `profiles` | existing policy (self + visibility) | `admin.user.edit` for privileged fields |
| `integrations` | `admin.integration.view`; **`config` only, never secret** | `admin.integration.manage` (super_admin) |
| `feature_flags` | authenticated (read toggle) | `admin.flag.manage` (super_admin/director) |
| `retention_policies` / `retention_runs` | `admin.retention.manage` | super_admin only |
| `login_attempts` | `admin.security.view` | insert via auth hook (service role) |
| `audit_log` / `credential_access_log` | `admin.audit.view` / `admin.security.view` | insert-only; append-only rules enforced |

---

## 5. API design

Module `api/*` are thin typed Supabase wrappers; privileged mutations go through **SECURITY DEFINER RPCs** (so RLS + admin checks live in the DB). Secrets go through Vault-backed RPCs / Edge Functions only.

### 5.1 Data-access functions (`modules/administration/api/`)
| Function | Inputs | Output | Authz |
|---|---|---|---|
| `listUsers(filter)` | search, role, org, active | `Profile[]` | `admin.user.view` |
| `getUser(id)` | uuid | `Profile` + overrides | `admin.user.view` |
| `listRoles()` | — | `Role[]` | authenticated |
| `getPermissionMatrix()` | — | `{permissions[], roles[], grants[]}` | authenticated |
| `listOrganizations()` | — | `Organization[]` | `admin.entity.view` |
| `listIntegrations()` | — | `Integration[]` (config only) | `admin.integration.view` |
| `listFeatureFlags()` | — | `FeatureFlag[]` | authenticated |
| `getAuditLog(filter)` | actor, action, table, range | `AuditEntry[]` | `admin.audit.view` |
| `getLoginAttempts(filter)` | email/code, success, range | `LoginAttempt[]` | `admin.security.view` |
| `getSystemHealth()` | — | health snapshot | `admin.health.view` |

### 5.2 RPCs (SECURITY DEFINER — existing + new)
| RPC | Inputs | Output | Authz check (in body) |
|---|---|---|---|
| `admin_create_user` *(exists)* | email, password, name, role, employee_code, phone, whatsapp | `uuid` | `has_role('super_admin','director')` |
| `admin_reset_password` *(exists)* | user_id, new_password | void | `has_role('super_admin','director')` |
| `admin_set_user_active` | user_id, active | void | `has_role('super_admin','director')` |
| `admin_grant_role` | user_id, role_key | void | `has_role('super_admin','director')` + rank guard (cannot self-escalate) — inserts `user_roles` |
| `admin_revoke_role` | user_id, role_key | void | `has_role('super_admin','director')` + rank guard — deletes `user_roles` |
| `admin_set_permission_override` | user_id, permission_key, effect, scope | void | `has_perm('admin.permission.assign')` |
| `admin_set_role_permission` | role_key, permission_key, granted, scope | void | `has_perm('admin.permission.assign')` + super_admin |
| `admin_set_delegation` | from_user, to_user, permission_key, scope, valid_from, valid_to | uuid | `has_perm('admin.permission.assign')`; audited |
| `admin_sync_permission_registry` | keys jsonb (from registry) | int upserted | super_admin / service |
| `admin_set_integration_secret` | key, secret, config | void | super_admin; writes Vault, stores reference only |
| `admin_set_feature_flag` | key, value, scope(prod\|stage) | void | `has_perm('admin.flag.manage')` |
| `admin_record_consent` | subject_user_id, purpose, lawful_basis, granted | uuid | self-service or `has_perm('admin.privacy.manage')` |
| `admin_resolve_dsr` | request_id, status, export_path | void | `has_perm('admin.privacy.manage')` |
| `has_perm(key)` / `has_perm(key, scope)` **[core helper]** | permission_key, optional scope | boolean | reads `role_permissions` ⊕ overrides ⊕ active `delegations` for `auth.uid()` |

`has_perm()` is the linchpin — a `stable security definer` function the same shape as `has_role()`, so RLS policies across **all** modules can call `using (has_perm('finance.invoice.void'))` or the scoped form `using (has_perm('finance.invoice.view', 'team'))`.

> **Canonical helper name (cross-cutting).** There is **one** permission helper: `has_perm(key)` and its scoped overload `has_perm(key, scope)`. **Every** module's RLS must call this exact name. The earlier draft signature `has_permission(uid, key)` is **retired** — do not introduce it; `has_perm` always resolves for `auth.uid()` internally.

### 5.3 Edge Functions
| Function | Trigger | Purpose | Secret source |
|---|---|---|---|
| `invite-user` *(exists)* | admin action | Email magic-link invite / create-with-password | service role |
| `admin-test-integration` | admin "Test connection" | Ping Razorpay/ZeptoMail/WhatsApp/Google/Anthropic | Vault |
| `admin-rotate-secret` | admin rotate | Write new Vault secret, verify, flip reference | Vault |
| `retention-purge` | pg_cron nightly | Export + purge per `retention_policies` | `automation_retention` role |
| `security-digest` | pg_cron daily | Summarize failed logins / credential reveals to admins | `automation_security` role |

> **Scoped automation identity (no blanket `service_role`).** Cron/Edge jobs must **not** run as Supabase `service_role`, which bypasses RLS entirely. Each job class gets a **least-privilege DB role** whose grants are limited to exactly the tables it needs:
>
> | Automation role | May touch | Must NOT touch |
> |---|---|---|
> | `automation_retention` | SELECT/DELETE on retention-governed tables; INSERT `retention_runs` | secrets, `profiles` writes, `role_permissions` |
> | `automation_security` | SELECT `login_attempts`/`credential_access_log`; INSERT `notification_log` | any write to identity/permission tables |
> | `automation_integration` | SELECT `integrations` config; read named Vault secrets; UPDATE `last_verified_*` | user/role tables, `audit_log` deletes |
> | `automation_registry` | UPSERT `permissions` (registry sync) | `role_permissions`, `user_roles` |
>
> `service_role` remains reserved for genuine auth hooks (e.g. `invite-user`, login capture) where no narrower role suffices, and each such use is documented in §10.

---

## 6. Permissions

Keys namespaced `admin.<entity>.<action>` (per the enterprise convention). Default role grants below seed `role_permissions`.

| Permission key | super_admin | director | manager | accounts | hr | executive | auditor |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `admin.console.view` | ✓ | ✓ | | | ✓ | | |
| `admin.user.view` | ✓ | ✓ | | | ✓ | | |
| `admin.user.edit` | ✓ | ✓ | | | ▲ | | |
| `admin.user.deactivate` | ✓ | ✓ | | | ▲ | | |
| `admin.role.view` | ✓ | ✓ | | | | | |
| `admin.role.manage` | ✓ | | | | | | |
| `admin.permission.assign` | ✓ | | | | | | |
| `admin.entity.view` | ✓ | ✓ | | ✓ | | | |
| `admin.entity.edit` | ✓ | ✓ | | | | | |
| `admin.integration.view` | ✓ | ✓ | | | | | |
| `admin.integration.manage` | ✓ | | | | | | |
| `admin.flag.manage` | ✓ | ✓ | | | | | |
| `admin.settings.edit` | ✓ | ✓ | | | | | |
| `admin.audit.view` | ✓ | ✓ | | | | | ✓ |
| `admin.security.view` | ✓ | ✓ | | | | | ✓ |
| `admin.retention.manage` | ✓ | | | | | | |
| `admin.privacy.manage` | ✓ | ✓ | | | ▲ | | |
| `admin.delegation.manage` | ✓ | ✓ | | | | | |
| `admin.health.view` | ✓ | ✓ | ✓ | | | | |

✓ = granted by default · ▲ = grantable via per-user override (delegated HR account creation / consent handling), off by default.

**Grants come from the grant model, not the enum.** A user's effective role set is the union of their `user_roles` rows (base + functional). Functional roles (e.g. `regulatory.reviewer`, `marketing.exec`, `lnd.instructor`, `procurement.officer`) inherit their `maps_to_base` floor and then carry finer permission grants. The columns above are the **base** roles; functional roles appear as additional matrix columns rendered from `roles` where `role_type = 'functional'`.

**Scope is shown, not just the checkbox.** Each granted cell also carries an effective **scope** (`own | team | all`) from `role_permissions.scope`; the matrix UI renders the scope chip beside the tick so an admin sees *whose* rows a role may act on, and `has_perm(key, scope)` enforces it in RLS.

**Delegation (acting-manager).** `admin.delegation.manage` lets a HOD/director create a time-boxed `delegations` grant so approvals don't stall during travel. Delegated authority is resolved inside `has_perm` (bounded by `valid_from/valid_to` and `scope`), never widens beyond the delegator's own grants, and every delegated authorization is written to `audit_log`.

**Multi-entity scoping (optional `org_id` predicate).** Where an organization runs multiple entities/branches and needs to keep their data separated, a policy may add an optional `org_id` predicate — `has_perm(key, scope) AND (org_id = auth_org_id() OR scope = 'all')` — so a holder's reach is confined to their own entity/branch unless explicitly granted cross-entity `all`. This path is additive and off by default; it does not change `has_perm`'s core resolution.

**RLS mapping.** Every admin mutation is guarded twice: `useCan('admin.x.y')` in the UI (affordance only) and `has_perm('admin.x.y')` / `has_role(...)` in the DB policy or RPC body (authoritative). The most dangerous actions (`admin.role.manage`, `admin.permission.assign`, `admin.integration.manage`, `admin.retention.manage`) are **super_admin-only regardless of override** — a hard floor in the RPC body, not just a matrix cell — to prevent privilege self-escalation.

### The cross-module permission rollup (the registry → matrix)

This is the module's defining responsibility. Each of the 15 modules declares its own keys in `modules/<x>/permissions.ts`; `core/registry.ts` aggregates them into `PERMISSIONS`; Administration **syncs** that aggregate into the `permissions` table so the matrix UI can render and assign every key in one place.

```mermaid
flowchart LR
  subgraph Modules["15 modules declare keys"]
    P1[operations.project.*]
    P2[hrms.leave.*]
    P3[finance.invoice.*]
    P4[regulatory.licence.*]
    Pn[...+ admin.*]
  end
  P1 & P2 & P3 & P4 & Pn --> REG[core/registry.ts\nMODULES.permissions]
  REG -->|admin_sync_permission_registry| PERM[(permissions table)]
  PERM --> MATRIX[Admin: Role x Permission matrix]
  MATRIX -->|toggle cell| RP[(role_permissions)]
  RP --> RESOLVE
  UO[(user_permission_overrides)] --> RESOLVE
  subgraph RESOLVE["has_perm(key, scope) — resolution"]
    direction TB
    R1{override deny?} -->|yes| DENY[DENY]
    R1 -->|no| R2{override allow at scope?}
    R2 -->|yes| ALLOW[ALLOW]
    R2 -->|no| R3{role granted at scope?}
    R3 -->|yes| ALLOW
    R3 -->|no| R4{active delegation?}
    R4 -->|yes| ALLOW
    R4 -->|no| DENY
  end
  ALLOW --> RLS[(RLS policies in every module\nusing has_perm)]
  DENY --> RLS
```

**Resolution order (authoritative, in `has_perm`):** per-user `deny` → per-user `allow` (at scope) → role grant (at scope, union of all `user_roles`) → active `delegations` → default deny. The tightest applicable scope wins. Super-admin hard-floor bypasses the matrix for platform-critical keys.

---

## 7. Dashboard

Admin Home (`/admin`) widgets and their sources:

| Widget | Metric | Source |
|---|---|---|
| Users by status | active / inactive / invited-pending | `profiles` |
| Users by role | count per role | `profiles` grouped |
| Failed logins (24h) | count + trend | `login_attempts where success=false` |
| Credential reveals (7d) | count + last actor | `credential_access_log` |
| Integrations health | per-integration up/down chip | `integrations.last_verified_status` |
| Feature flags | enabled count, prod vs stage diff | `feature_flags` |
| Recent admin actions | last 10 audit entries | `audit_log` |
| System health | DB/Edge/cron/migration head/app version | `getSystemHealth()` |
| Retention next run | next purge time + last rows purged | `retention_runs` / cron |

---

## 8. Reports

| Report | Columns | Filters | Export |
|---|---|---|---|
| User roster | name, email/code, role, entity, status, last login, created | role, entity, status | CSV, XLSX |
| Permission matrix export | permission key, module, per-role grant | module | CSV, XLSX |
| Effective permissions per user | user, key, source (role/override), effect | user | CSV |
| Audit trail | timestamp, actor, action, table, record, before→after | actor, action, table, date range | CSV, XLSX |
| Login attempts | timestamp, email/code, success, IP, reason | success, date range | CSV |
| Credential access | timestamp, license, actor, reason, IP | actor, date range | CSV |
| Integration event log | timestamp, integration, event, status | integration, event | CSV |
| Retention runs | data class, rows purged, export path, ran_at | data class, date range | CSV |

All exports go through the shared export helper; secret values are **never** exportable (integration reports show config keys only, not secrets).

**Export is a gated, logged capability (cross-cutting).** Producing any CSV/XLSX is a distinct verb, not implied by view. Every module declares a `<module>.<entity>.export` key backed by a core `data.export` capability, and the shared export helper checks it before emitting a file. Exports of **sensitive classes — PII, salary/payroll, the audit trail, and the credential-access log — require the export verb in addition to view**, and **every export is written to `audit_log`** (actor, report, filter, row count, timestamp) so data egress is itself auditable. In this module the relevant keys are `admin.audit.export`, `admin.security.export` (login/credential logs), and `admin.user.export` (roster with PII); they default to super_admin/director only.

---

## 9. Notifications

Event → `notification_type` → recipients → channels. Delivery via `core/notifications`, gated by `reminder_settings`/`feature_flags`.

| Event | Type | Recipients | Channels |
|---|---|---|---|
| User invited | `user_invited` | invitee | email (magic-link) |
| Account created (code) | `account_created` | new user (+ HR/admin) | email/in-app |
| Password reset by admin | `password_reset_admin` | affected user | email/in-app |
| Role/permission changed | `permission_changed` | affected user + super_admins | in-app |
| Integration disabled/failed test | `integration_alert` | super_admins | in-app + email |
| Failed-login spike threshold | `security_alert` | super_admins | in-app + email |
| Credential reveal | `credential_reveal_alert` | super_admins | in-app |
| Retention purge completed | `retention_report` | super_admins | in-app |

Notification types are **rows in the `notification_types` lookup table**, not values of a platform-wide `notification_type` enum — a new type is an insert (owning module + default channels), so modules no longer `ALTER` a shared enum. **SMS** joins email, in-app and (gated) WhatsApp as a delivery channel (OTP + reminders). Administration owns whether a channel is *allowed* (feature flags); it never bypasses `core/notifications` to send directly.

---

## 10. Automations

| Job | Kind | Trigger / cadence | Action |
|---|---|---|---|
| Login attempt capture | event | Supabase auth hook / `security-log` | Insert `login_attempts`; lock/throttle on N failures |
| Failed-login digest | scheduled | pg_cron daily 09:00 IST → `security-digest` | Summarize to super_admins |
| Retention purge | scheduled | pg_cron nightly → `retention-purge` | Export then purge per `retention_policies` |
| Integration heartbeat | scheduled | pg_cron hourly → `admin-test-integration` | Update `last_verified_status/at` |
| Permission registry sync | event | on deploy / admin action → `admin_sync_permission_registry` | Upsert `permissions` from registry |
| Audit trigger | event | DB triggers on sensitive tables | Write `audit_log` (who/what/when/before/after) |
| Session revoke on deactivate | event | `admin_set_user_active(false)` | Invalidate refresh tokens |

All scheduled work is **gated by settings/flags** so staging stays sandboxed (no real emails, no live provider calls) per the staging-environment rule.

**Each job runs under a scoped least-privilege DB role, not blanket `service_role`** (see §5.3): `retention-purge` → `automation_retention`, `security-digest` → `automation_security`, integration heartbeat → `automation_integration`, registry sync → `automation_registry`. Only genuine auth-hook jobs that need it — **login attempt capture** and **`invite-user`** — retain `service_role`, and that reliance is called out here as the documented exception. Delegation expiry (deactivating `delegations` past `valid_to`) is added as a nightly job under `automation_security`.

---

## 11. Integrations

| System | Purpose | Boundary / adapter | Secret handling |
|---|---|---|---|
| **Razorpay** | Payment gateway (Finance consumes; admin configures) | `integrations.razorpay` + `admin-test-integration` | key/secret in **Vault**; reference only in DB |
| **ZeptoMail** | Transactional email (OTP, invites, digests) | `integrations.zeptomail`; used by `invite-user`/notify | API key in Vault |
| **SMS gateway (MSG91 / Gupshup / Twilio)** | SMS OTP + reminders — **second live external channel** alongside email (WhatsApp still gated) | `integrations.sms` + `sms_enabled` flag; consumed by `core/notifications` | API key / sender-id in Vault |
| **WhatsApp BSP (AiSensy)** | WhatsApp notifications | `integrations.whatsapp` + `whatsapp_enabled` flag | token in Vault; existing `whatsapp_api_key` migrates from `app_settings` → Vault |
| **Google (Drive/Sheets)** | File storage + sheet sync | `integrations.google`; `core/files` consumes | service-account JSON in Vault; `disableConversionToGoogleType:true` |
| **Anthropic** | AI Assistant module | `integrations.anthropic` | API key in Vault |
| **Supabase Vault** | Secret store | native | authoritative crypto boundary — Administration only stores references |
| **Supabase Auth** | Identity | native | `admin_create_user`, `invite-user`, session revoke |

**Adapter rule.** No module reads a provider secret directly. Administration writes the secret to Vault + a toggle/config row; the consuming module's Edge Function fetches the secret from Vault at call time. This keeps secrets out of the frontend, out of `app_settings`, and out of `audit_log`.

---

## 12. Future scalability

- **Role growth without migrations.** New roles (functional or base) are **rows in `roles` + grants in `user_roles`**, never enum migrations — so adding certification sub-roles, marketing tiers, L&D or procurement roles is a data change. The legacy `user_role` enum is frozen and contracted out once all RLS readers move to the grant model.
- **10× users / multi-entity.** `profiles.org_id` + `organizations` (the single legal-entity master) already model the two legal entities; adding a third entity is a data insert, not a schema change. The permission matrix is entity-agnostic; the optional `org_id` predicate in `has_perm(key, scope)` lets impartiality-sensitive policies confine a holder to their own entity, and per-entity roles need only the additive `org_id` path — no change to `has_perm`'s default resolution.
- **Notification/type growth.** The `notification_types` lookup absorbs new types by insert; no shared enum to `ALTER`, so modules scale their notifications independently.
- **Toward multi-tenant.** The single-tenant model holds; if tenancy is introduced, `has_perm()` and RLS already centralize authz, so a `tenant_id` predicate can be layered into policies uniformly rather than per-module.
- **Permission volume.** With ~15 modules × ~8 keys ≈ 120 permission rows, the matrix stays a single-screen render; `permissions`/`role_permissions` are tiny and fully cached. `has_perm` is `stable` and index-backed (`role_permissions(role_key, permission_key)`), negligible RLS cost.
- **Audit/log growth.** `audit_log` is the append-only spine and the highest-volume table; it is **partitioned by month** (`created_at`) from day one, with a declared **retention window** (e.g. 24 months hot, exported-then-detached beyond) driven by `retention_policies` + nightly `retention-purge`. `login_attempts`, `whatsapp_log`, `notification_log` follow the same partition-and-retain pattern. **Central vs module-local logs:** the central `audit_log` records identity/permission/security/config mutations and every export; high-frequency business-state history (e.g. project stage transitions, invoice status changes) stays in **module-local** history tables and is *summarized*, not duplicated, into the central log — keeping `audit_log` forensic rather than a firehose.
- **Registry drift (real risk from prod).** Because repo migrations are known not to reproduce prod exactly, `admin_sync_permission_registry` is *idempotent upsert*, and a **drift check** compares live `permissions` against the deployed `MODULES[].permissions`, flagging orphans/missing keys in System Health rather than silently diverging.
- **Two-person integrity.** As the org grows, the super-admin hard-floor on secret rotation and role management can be extended to require a second approver (a `pending_admin_actions` table) without changing consumers.

---

## 13. Architecture diagram

```mermaid
flowchart TB
  subgraph UI["Administration module (frontend)"]
    PG[pages: Users / Roles Matrix / Integrations / Security / Retention / Health]
    HK[hooks: React Query]
    API[api: typed Supabase wrappers]
  end

  subgraph Core["core/*"]
    ACC["core/access\nuseCan / has_perm / RoleGuard"]
    NOT["core/notifications\nnotify()"]
    REG["core/registry.ts\nMODULES[].permissions"]
    AUTH["core/auth\nsession"]
  end

  subgraph DB["Supabase Postgres (RLS)"]
    PROF[(profiles)]
    ROLEP[(roles / user_roles / permissions / role_permissions / user_permission_overrides / delegations)]
    ORG[(organizations)]
    INTG[(integrations)]
    FLAG[(feature_flags)]
    AUD[(audit_log / login_attempts / credential_access_log)]
    RET[(retention_policies / runs)]
    RPC[["RPCs: admin_create_user, admin_reset_password,\nadmin_set_role_permission, admin_set_integration_secret,\nhas_perm()"]]
    VAULT[(Supabase Vault\nsecrets)]
    CRON[[pg_cron]]
  end

  subgraph Edge["Edge Functions"]
    INV[invite-user]
    TEST[admin-test-integration]
    PURGE[retention-purge]
    SEC[security-digest]
  end

  subgraph Ext["External providers"]
    RZP[Razorpay]
    ZM[ZeptoMail]
    WA[WhatsApp BSP]
    GOO[Google Drive/Sheets]
    ANT[Anthropic]
  end

  PG --> HK --> API
  API --> RPC
  API -->|read config only| INTG
  API --> PROF & ROLEP & ORG & FLAG & AUD & RET
  ACC -->|has_perm| ROLEP
  REG -->|sync| ROLEP
  RPC -->|write secret ref| VAULT
  RPC --> AUD
  CRON --> PURGE & SEC & TEST
  TEST -->|read secret| VAULT
  TEST --> RZP & ZM & WA & GOO & ANT
  INV --> ZM
  PURGE --> RET & AUD
  NOT -->|gated by| FLAG
  AUTH --> PROF
```

---

**Cross-module contract summary.** Administration is the *producer* of the identity + permission + settings substrate that every other module *consumes* via `core/access` (`has_perm`), `core/notifications` (flags), and Vault-backed secrets. It defines only `admin.*` keys but **assigns all modules' keys**, making it the single control point for platform-wide authorization.

---

## Validation amendments (v1.1)

Incorporates validated architecture-review findings (design-only; expand-contract preserved):

1. **Decoupled role-grant model** — `roles` (base + functional, keyed by `role_key`) + `user_roles` M2M; `has_role()` reads grants, `user_role` enum kept backward-compat only. Functional→platform mapping via `maps_to_base`. (§4, §6, §12)
2. **Scope dimension** — `scope (own|team|all)` on `role_permissions` + overrides; consumed by `has_perm(key, scope)`; effective scope rendered in the matrix. (§4, §6)
3. **Delegation** — time-boxed `delegations` (from/to/scope/valid_from/valid_to), resolved in `has_perm`, audited. (§4, §5, §6)
4. **Export capability** — cross-cutting `<module>.<entity>.export` verb / core `data.export`, gating PII/salary/audit/credential exports; every export logged. (§8)
5. **Scoped automation identity** — least-privilege `automation_*` DB roles per job class replace blanket `service_role`. (§5, §10)
6. **Canonical helper** — standardized on `has_perm(key)` / `has_perm(key, scope)`; `has_permission(uid,key)` retired. (§5)
7. **Single masters** — `organizations` is THE legal-entity master (Finance `legal_entities` retired); `org_number_series` is the single numbering owner for all series. (§1, §4)
8. **`notification_types` lookup** — replaces the platform-wide `notification_type` enum. (§4, §9, §12)
9. **DPDP Act 2023 sub-domain** — `consent_records` + `data_subject_requests`; `admin.privacy.manage` key + RPCs. (§1, §4, §6)
10. **Audit volume** — `audit_log` partitioned by month + retention window; central-vs-module-local logging boundary. (§12)
11. **SMS channel** — SMS gateway (MSG91/Gupshup/Twilio) added as a second live external channel for OTP + reminders. (§1, §9, §11)
12. **Two-entity scoping** — optional `org_id` predicate path in `has_perm` for multi-entity/branch scoping. (§6, §12)

**Scope v2.0: residual Certification-Body references removed** — the Certification Body is out of the TPS Platform (separate entity/future platform); remaining CB references (two-entity naming, `certificate` numbering series, `certification.*` role/permission examples) generalized to the single organization + future branches. Internal read-only `auditor` role preserved.
