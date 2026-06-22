-- ============================================================
-- TPS-OMS Migration 003: Row Level Security Policies
-- ============================================================
-- RLS is the server-side security layer.
-- Rules: employees see their own projects; managers see all in their team;
--        directors/super_admin/auditor see everything.
-- ============================================================

-- Helper: get current user's role
create or replace function auth_role()
returns user_role language sql stable security definer as $$
  select role from profiles where id = auth.uid()
$$;

-- Helper: check if current user has one of a set of roles
create or replace function has_role(variadic roles user_role[])
returns boolean language sql stable security definer as $$
  select auth_role() = any(roles)
$$;

-- ============================================================
-- Enable RLS on all tables
-- ============================================================
alter table profiles            enable row level security;
alter table clients             enable row level security;
alter table licenses            enable row level security;
alter table credential_access_log enable row level security;
alter table projects            enable row level security;
alter table block_requests      enable row level security;
alter table stages              enable row level security;
alter table stage_timeline      enable row level security;
alter table payments            enable row level security;
alter table documents           enable row level security;
alter table authority_queries   enable row level security;
alter table soi_archive         enable row level security;
alter table notifications       enable row level security;
alter table knowledge_base      enable row level security;
alter table performance_reports enable row level security;
alter table audit_log           enable row level security;

-- ============================================================
-- PROFILES
-- ============================================================
create policy "profiles_select_own" on profiles
  for select using (id = auth.uid() or has_role('super_admin','director','manager','hr','auditor'));

create policy "profiles_insert_admin" on profiles
  for insert with check (has_role('super_admin','director','hr'));

create policy "profiles_update_own_or_admin" on profiles
  for update using (id = auth.uid() or has_role('super_admin','director','hr'));

-- ============================================================
-- CLIENTS
-- ============================================================
create policy "clients_select_all_staff" on clients
  for select using (has_role('super_admin','director','manager','executive','accounts','auditor'));

create policy "clients_insert_manager_up" on clients
  for insert with check (has_role('super_admin','director','manager'));

create policy "clients_update_manager_up" on clients
  for update using (has_role('super_admin','director','manager'));

-- ============================================================
-- LICENSES
-- ============================================================
create policy "licenses_select_all_staff" on licenses
  for select using (has_role('super_admin','director','manager','executive','accounts','auditor'));

create policy "licenses_insert_manager_up" on licenses
  for insert with check (has_role('super_admin','director','manager'));

create policy "licenses_update_manager_up" on licenses
  for update using (has_role('super_admin','director','manager'));

-- ============================================================
-- CREDENTIAL ACCESS LOG
-- ============================================================
create policy "cred_log_select_manager_up" on credential_access_log
  for select using (has_role('super_admin','director','manager','auditor'));

create policy "cred_log_insert_via_function" on credential_access_log
  for insert with check (
    has_role('super_admin','director','manager','executive')
  );

-- ============================================================
-- PROJECTS
-- ============================================================
create policy "projects_select" on projects
  for select using (
    has_role('super_admin','director','manager','accounts','auditor')
    or assigned_to = auth.uid()
    or manager_id  = auth.uid()
  );

create policy "projects_insert_manager_up" on projects
  for insert with check (has_role('super_admin','director','manager'));

create policy "projects_update_assigned_or_manager" on projects
  for update using (
    has_role('super_admin','director','manager')
    or assigned_to = auth.uid()
  );

-- ============================================================
-- BLOCK REQUESTS
-- ============================================================
create policy "block_req_select" on block_requests
  for select using (
    has_role('super_admin','director','manager','auditor')
    or requested_by = auth.uid()
  );

create policy "block_req_insert_executive" on block_requests
  for insert with check (
    has_role('super_admin','director','manager','executive')
  );

create policy "block_req_update_manager_approve" on block_requests
  for update using (has_role('super_admin','director','manager'));

-- ============================================================
-- STAGES
-- ============================================================
create policy "stages_select" on stages
  for select using (
    has_role('super_admin','director','manager','accounts','auditor')
    or assigned_to = auth.uid()
    or exists (
      select 1 from projects p
      where p.id = stages.project_id
        and (p.assigned_to = auth.uid() or p.manager_id = auth.uid())
    )
  );

create policy "stages_insert_manager_up" on stages
  for insert with check (has_role('super_admin','director','manager'));

create policy "stages_update_assigned_or_manager" on stages
  for update using (
    has_role('super_admin','director','manager')
    or assigned_to = auth.uid()
  );

-- ============================================================
-- STAGE TIMELINE
-- ============================================================
create policy "stage_timeline_select" on stage_timeline
  for select using (
    has_role('super_admin','director','manager','auditor')
    or created_by = auth.uid()
    or exists (
      select 1 from projects p
      where p.id = stage_timeline.project_id
        and (p.assigned_to = auth.uid() or p.manager_id = auth.uid())
    )
  );

create policy "stage_timeline_insert" on stage_timeline
  for insert with check (
    has_role('super_admin','director','manager','executive')
  );

-- ============================================================
-- PAYMENTS
-- ============================================================
create policy "payments_select" on payments
  for select using (
    has_role('super_admin','director','manager','accounts','auditor')
  );

create policy "payments_insert_accounts_up" on payments
  for insert with check (has_role('super_admin','director','manager','accounts'));

-- ============================================================
-- DOCUMENTS
-- ============================================================
create policy "documents_select" on documents
  for select using (
    has_role('super_admin','director','manager','accounts','auditor')
    or uploaded_by = auth.uid()
    or exists (
      select 1 from projects p
      where p.id = documents.project_id
        and (p.assigned_to = auth.uid() or p.manager_id = auth.uid())
    )
  );

create policy "documents_insert" on documents
  for insert with check (has_role('super_admin','director','manager','executive'));

-- ============================================================
-- AUTHORITY QUERIES
-- ============================================================
create policy "authority_queries_select" on authority_queries
  for select using (
    has_role('super_admin','director','manager','executive','auditor')
    or exists (
      select 1 from projects p
      where p.id = authority_queries.project_id
        and (p.assigned_to = auth.uid() or p.manager_id = auth.uid())
    )
  );

create policy "authority_queries_insert" on authority_queries
  for insert with check (has_role('super_admin','director','manager','executive'));

-- ============================================================
-- SOI ARCHIVE
-- ============================================================
create policy "soi_select_all_staff" on soi_archive
  for select using (has_role('super_admin','director','manager','executive','accounts','auditor'));

create policy "soi_insert_manager_up" on soi_archive
  for insert with check (has_role('super_admin','director','manager','executive'));

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
create policy "notifications_own" on notifications
  for all using (user_id = auth.uid() or has_role('super_admin','director'));

-- ============================================================
-- KNOWLEDGE BASE
-- ============================================================
create policy "knowledge_base_select_published" on knowledge_base
  for select using (
    is_published = true
    or has_role('super_admin','director','manager')
  );

create policy "knowledge_base_write_manager_up" on knowledge_base
  for insert with check (has_role('super_admin','director','manager'));

create policy "knowledge_base_update_manager_up" on knowledge_base
  for update using (has_role('super_admin','director','manager'));

-- ============================================================
-- PERFORMANCE REPORTS
-- ============================================================
create policy "perf_reports_select" on performance_reports
  for select using (
    has_role('super_admin','director','auditor')
    or user_id = auth.uid()
  );

create policy "perf_reports_insert_director_up" on performance_reports
  for insert with check (has_role('super_admin','director'));

-- ============================================================
-- AUDIT LOG
-- ============================================================
create policy "audit_log_select_director_up" on audit_log
  for select using (has_role('super_admin','director','auditor'));

create policy "audit_log_insert_any_auth" on audit_log
  for insert with check (auth.uid() is not null);
