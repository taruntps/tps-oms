-- Migration 078 — Administration: grant-based permission registry (Wave 1, EXPAND step).
-- ADDITIVE + BACKWARD-COMPATIBLE: the existing `user_role` enum, has_role()/auth_role(),
-- profiles.role, and all `allowedRoles` guards KEEP WORKING UNCHANGED. This adds a parallel
-- grant layer (roles/user_roles/permissions/role_permissions + has_perm) seeded from the
-- current state so behaviour is identical today. Nothing is switched or removed here.
-- Per Constitution: Expand -> (later) Migrate -> Validate -> Switch -> Remove.

-- ── Organizations (single legal-entity master; single-tenant now, multi-branch later) ──
create table if not exists public.organizations (
  id           uuid primary key default uuid_generate_v4(),
  org_key      text unique not null,
  legal_name   text not null,
  gstin        text,
  pan          text,
  address      text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
insert into public.organizations (org_key, legal_name)
  values ('tps_xperts_group', 'TPS Xperts Group')
  on conflict (org_key) do nothing;

-- ── Roles (base + future functional) — decoupled from the enum, seeded from it ──
create table if not exists public.roles (
  role_key    text primary key,
  label       text not null,
  role_type   text not null default 'base' check (role_type in ('base','functional')),
  maps_to_base user_role,              -- functional roles inherit a base floor
  is_system   boolean not null default true,
  sort_order  int not null default 100,
  created_at  timestamptz not null default now()
);
insert into public.roles (role_key, label, role_type, maps_to_base, sort_order) values
  ('super_admin','Super Admin','base','super_admin',1),
  ('director','Director','base','director',2),
  ('manager','Manager','base','manager',3),
  ('executive','Executive','base','executive',4),
  ('accounts','Accounts','base','accounts',5),
  ('hr','HR','base','hr',6),
  ('auditor','Auditor (read-only)','base','auditor',7)
on conflict (role_key) do nothing;

-- ── User ↔ role grants (many-to-many) — seeded from profiles.role ──
create table if not exists public.user_roles (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role_key   text not null references public.roles(role_key) on delete cascade,
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role_key)
);
insert into public.user_roles (user_id, role_key)
  select id, role::text from public.profiles
  on conflict do nothing;

-- ── Permission registry (module.entity.action) + optional data scope ──
create table if not exists public.permissions (
  perm_key   text primary key,
  module     text not null,
  label      text not null,
  is_system  boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.role_permissions (
  role_key   text not null references public.roles(role_key) on delete cascade,
  perm_key   text not null references public.permissions(perm_key) on delete cascade,
  scope      text not null default 'all' check (scope in ('own','team','all')),
  primary key (role_key, perm_key)
);
create table if not exists public.user_permission_overrides (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  perm_key text not null references public.permissions(perm_key) on delete cascade,
  granted  boolean not null default true,
  scope    text not null default 'all' check (scope in ('own','team','all')),
  primary key (user_id, perm_key)
);

-- ── Time-boxed delegation (acting-manager cover) ──
create table if not exists public.delegations (
  id         uuid primary key default uuid_generate_v4(),
  from_user  uuid not null references public.profiles(id) on delete cascade,
  to_user    uuid not null references public.profiles(id) on delete cascade,
  scope_note text,
  valid_from timestamptz not null default now(),
  valid_to   timestamptz not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (valid_to > valid_from)
);
create index if not exists delegations_to_active_idx on public.delegations(to_user, valid_to);

-- ── Seed a starter permission set (Wave-1 modules + base). Additive; drives the admin matrix. ──
insert into public.permissions (perm_key, module, label) values
  -- administration
  ('admin.user.view','administration','View users'),
  ('admin.user.manage','administration','Create/edit/deactivate users'),
  ('admin.role.manage','administration','Manage roles & permissions'),
  ('admin.setting.manage','administration','Manage settings & integrations'),
  ('admin.audit.view','administration','View audit log'),
  ('admin.privacy.manage','administration','Manage consent & data-subject requests'),
  ('admin.entity.view','administration','View organization/entity settings'),
  -- documents
  ('documents.doc.view','documents','View documents'),
  ('documents.doc.upload','documents','Upload documents'),
  ('documents.doc.delete','documents','Delete documents'),
  ('documents.doc.export','documents','Export/download documents'),
  ('documents.template.manage','documents','Manage document templates'),
  -- knowledge
  ('knowledge.article.view','knowledge','Read knowledge articles'),
  ('knowledge.article.author','knowledge','Create/edit articles'),
  ('knowledge.article.publish','knowledge','Publish/review articles'),
  ('knowledge.category.manage','knowledge','Manage categories & tags')
on conflict (perm_key) do nothing;

-- Seed sensible base-role grants (super_admin implicitly all via has_perm floor; grant others explicitly).
insert into public.role_permissions (role_key, perm_key, scope)
select r.role_key, p.perm_key, 'all'
from (values ('director'),('super_admin')) r(role_key)
cross join public.permissions p
on conflict do nothing;
-- managers: content + read, not user/role/setting admin
insert into public.role_permissions (role_key, perm_key, scope) values
  ('manager','documents.doc.view','all'), ('manager','documents.doc.upload','all'), ('manager','documents.doc.export','all'),
  ('manager','knowledge.article.view','all'), ('manager','knowledge.article.author','all'), ('manager','knowledge.article.publish','all'),
  ('manager','admin.audit.view','team')
on conflict do nothing;
-- all-staff read baseline for knowledge + own documents
insert into public.role_permissions (role_key, perm_key, scope)
select r, 'knowledge.article.view', 'all' from unnest(array['executive','accounts','hr','auditor']) r
on conflict do nothing;
insert into public.role_permissions (role_key, perm_key, scope)
select r, 'documents.doc.view', 'own' from unnest(array['executive','accounts','hr']) r
on conflict do nothing;
insert into public.role_permissions (role_key, perm_key, scope)
  values ('auditor','documents.doc.view','all'), ('auditor','admin.audit.view','all')
on conflict do nothing;

-- ── has_perm(): the canonical permission check. SECURITY DEFINER (bypasses RLS on the
--     registry tables). Super_admin = hard floor. Checks user_roles→role_permissions,
--     user overrides, and active delegations (delegate inherits delegator's grants). ──
create or replace function public.has_perm(p_key text, p_scope text default 'all')
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  with me as (select auth.uid() as uid),
  -- super_admin hard floor
  floor as (
    select true as ok from public.user_roles ur, me
    where ur.user_id = me.uid and ur.role_key = 'super_admin'
  ),
  -- effective role set = own roles + roles of anyone currently delegating to me
  eff_roles as (
    select ur.role_key from public.user_roles ur, me where ur.user_id = me.uid
    union
    select ur.role_key from public.delegations d
    join public.user_roles ur on ur.user_id = d.from_user, me
    where d.to_user = me.uid and now() between d.valid_from and d.valid_to
  ),
  role_grant as (
    select rp.scope from public.role_permissions rp
    join eff_roles er on er.role_key = rp.role_key
    where rp.perm_key = p_key
  ),
  override as (
    select o.granted, o.scope from public.user_permission_overrides o, me
    where o.user_id = me.uid and o.perm_key = p_key
  )
  select
    coalesce((select ok from floor), false)
    or coalesce((select granted from override), false)
    or exists (
      select 1 from role_grant
      where case p_scope when 'own' then true
                         when 'team' then scope in ('team','all')
                         else scope = 'all' end
    );
$$;

-- ── Notification types as a lookup (existing notification_type enum stays; this is additive) ──
create table if not exists public.notification_types (
  type_key         text primary key,
  label            text not null,
  default_channels text[] not null default array['in_app']
);
insert into public.notification_types (type_key, label)
  select unnest(enum_range(null::notification_type))::text, unnest(enum_range(null::notification_type))::text
on conflict (type_key) do nothing;

-- ── Unified numbering series (single owner; additive — existing generators keep working) ──
create table if not exists public.org_number_series (
  series_key text primary key,
  org_id     uuid references public.organizations(id),
  prefix     text not null default '',
  next_seq   bigint not null default 1,
  updated_at timestamptz not null default now()
);

-- ── DPDP Act 2023: consent register + data-subject requests (additive) ──
create table if not exists public.consent_records (
  id           uuid primary key default uuid_generate_v4(),
  subject_type text not null,          -- 'client' | 'employee' | 'vendor' | 'contact'
  subject_id   uuid,
  purpose      text not null,
  basis        text not null default 'consent',
  granted      boolean not null default true,
  granted_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  recorded_by  uuid references public.profiles(id)
);
create table if not exists public.data_subject_requests (
  id           uuid primary key default uuid_generate_v4(),
  subject_type text not null,
  subject_id   uuid,
  kind         text not null check (kind in ('access','erasure','rectification','portability')),
  status       text not null default 'open' check (status in ('open','in_progress','fulfilled','rejected')),
  detail       text,
  requested_at timestamptz not null default now(),
  handled_by   uuid references public.profiles(id),
  handled_at   timestamptz
);

-- ── RLS: registry tables are admin-managed; has_perm() (SECURITY DEFINER) reads them safely. ──
alter table public.organizations enable row level security;
alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.delegations enable row level security;
alter table public.notification_types enable row level security;
alter table public.org_number_series enable row level security;
alter table public.consent_records enable row level security;
alter table public.data_subject_requests enable row level security;

-- Everyone authenticated may READ the reference/registry (needed for the admin matrix + own grants);
-- only admins may WRITE. Uses the existing has_role() so this is consistent with V1 today.
do $$
declare t text;
begin
  foreach t in array array['organizations','roles','user_roles','permissions','role_permissions',
                           'user_permission_overrides','delegations','notification_types','org_number_series',
                           'consent_records','data_subject_requests']
  loop
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format('create policy %I on public.%I for select to public using (auth.uid() is not null)', t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($p$create policy %I on public.%I for all to public using (has_role(VARIADIC array['super_admin'::user_role,'director'::user_role])) with check (has_role(VARIADIC array['super_admin'::user_role,'director'::user_role]))$p$, t||'_write', t);
  end loop;
end $$;
