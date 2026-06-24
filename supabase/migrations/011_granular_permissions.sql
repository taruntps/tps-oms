-- Migration 011: Granular per-user permission flags
--
-- Replaces role-hardcoded project access with three per-user flags, set in
-- User Management (augmenting the role — super_admin/director always full):
--   • can_be_assigned     (Doer)       — can be picked as a project's executive
--   • can_assign          (Assigner)   — can create/assign projects to others
--   • can_view_all_projects (Visibility)— sees ALL projects (Overall), else only own
--
-- Seeded from current role behaviour so nobody loses access on rollout.

-- ── 1. FLAGS ─────────────────────────────────────────────────────────────────
alter table profiles
  add column if not exists can_be_assigned        boolean not null default true,
  add column if not exists can_assign             boolean not null default false,
  add column if not exists can_view_all_projects  boolean not null default false;

-- Preserve existing access:
--   managers+ could assign and see all; accounts/auditor could see all.
update profiles set can_assign = true
  where role in ('super_admin', 'director', 'manager');

update profiles set can_view_all_projects = true
  where role in ('super_admin', 'director', 'manager', 'accounts', 'auditor');

-- ── 2. HELPERS ───────────────────────────────────────────────────────────────
create or replace function fn_can_view_all_projects()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('super_admin','director') or can_view_all_projects
     from profiles where id = auth.uid()),
    false);
$$;

create or replace function fn_can_assign()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('super_admin','director') or can_assign
     from profiles where id = auth.uid()),
    false);
$$;

-- ── 3. PROJECT RLS — flag-driven ─────────────────────────────────────────────
-- SELECT: see all if Visibility, else only your own (assigned or managed).
drop policy if exists "projects_select" on projects;
create policy "projects_select" on projects
  for select using (
    fn_can_view_all_projects()
    or assigned_to = auth.uid()
    or manager_id  = auth.uid()
  );

-- INSERT: only Assigners (or super_admin/director).
drop policy if exists "projects_insert_manager_up" on projects;
drop policy if exists "projects_insert" on projects;
create policy "projects_insert" on projects
  for insert with check (fn_can_assign());

-- UPDATE: Assigners, or the assigned executive on their own project.
-- (Visibility alone is view-only — it does NOT grant edit on others' projects.)
drop policy if exists "projects_update_assigned_or_manager" on projects;
drop policy if exists "projects_update" on projects;
create policy "projects_update" on projects
  for update using (
    fn_can_assign()
    or assigned_to = auth.uid()
  );
