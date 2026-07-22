-- Migration 094 (HRMS M5 Recruitment & Lifecycle). Applied to staging; additive/EXPAND. Internal-only recruitment; lifecycle events reuse M1 hr_employee_status_events; money=paise; audit+RLS.
-- Migration 094 — HRMS M5: Recruitment & Employee Lifecycle. EXPAND only (additive).
-- Recruitment INTERNAL ONLY. Lifecycle events REUSE M1 hr_employee_status_events.
-- Money=paise. audit fn_audit_wave2.

create table if not exists public.hr_job_requisitions (
  id uuid primary key default uuid_generate_v4(),
  department_id uuid references public.hr_departments(id), designation_id uuid references public.hr_designations(id),
  grade_id uuid references public.hr_grades(id), headcount int not null default 1, budget_ctc bigint,
  justification text, status text not null default 'draft' check (status in ('draft','pending','approved','on_hold','closed','rejected')),
  raised_by uuid references public.profiles(id), approved_by uuid references public.profiles(id), decided_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.hr_job_postings (
  id uuid primary key default uuid_generate_v4(),
  requisition_id uuid references public.hr_job_requisitions(id) on delete cascade,
  title text not null, description text, channel text not null default 'internal' check (channel in ('internal')),
  status text not null default 'open' check (status in ('open','closed')), valid_until date, created_at timestamptz not null default now()
);
create table if not exists public.hr_candidates (
  id uuid primary key default uuid_generate_v4(),
  name text not null, email text, phone text, source text, resume_document_id uuid,
  current_ctc bigint, expected_ctc bigint,
  status text not null default 'new' check (status in ('new','screening','interview','offer','hired','rejected')),
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.hr_candidate_applications (
  id uuid primary key default uuid_generate_v4(),
  candidate_id uuid not null references public.hr_candidates(id) on delete cascade,
  posting_id uuid references public.hr_job_postings(id), stage text, status text not null default 'active'
    check (status in ('active','rejected','hired','withdrawn')), created_at timestamptz not null default now(),
  unique (candidate_id, posting_id)
);
create table if not exists public.hr_interviews (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null references public.hr_candidate_applications(id) on delete cascade,
  stage text, scheduled_at timestamptz, interviewer_id uuid references public.profiles(id),
  status text not null default 'scheduled' check (status in ('scheduled','done','cancelled','no_show')), created_at timestamptz not null default now()
);
create table if not exists public.hr_interview_feedback (
  id uuid primary key default uuid_generate_v4(),
  interview_id uuid not null references public.hr_interviews(id) on delete cascade,
  interviewer_id uuid references public.profiles(id), score numeric(4,1),
  recommendation text check (recommendation in ('hire','hold','reject')), notes text, created_at timestamptz not null default now()
);
create table if not exists public.hr_offers (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null references public.hr_candidate_applications(id) on delete cascade,
  ctc bigint, joining_date date, template_id uuid, document_id uuid,
  status text not null default 'draft' check (status in ('draft','sent','accepted','declined','expired')),
  approved_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.hr_onboarding_templates (
  id uuid primary key default uuid_generate_v4(), name text not null, tasks jsonb not null default '[]'::jsonb,
  is_active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.hr_onboarding (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade, template_id uuid references public.hr_onboarding_templates(id),
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  started_at timestamptz not null default now(), completed_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.hr_onboarding_tasks (
  id uuid primary key default uuid_generate_v4(),
  onboarding_id uuid not null references public.hr_onboarding(id) on delete cascade,
  title text not null, owner_id uuid references public.profiles(id), due_date date,
  status text not null default 'pending' check (status in ('pending','done','waived')), document_id uuid, created_at timestamptz not null default now()
);
create table if not exists public.hr_separations (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'resignation' check (type in ('resignation','termination','retirement')),
  notice_date date, last_working_day date, reason text,
  status text not null default 'initiated' check (status in ('initiated','approved','exit_interview','clearance','fnf','completed','cancelled')),
  approved_by uuid references public.profiles(id), created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.hr_exit_interviews (
  id uuid primary key default uuid_generate_v4(),
  separation_id uuid not null references public.hr_separations(id) on delete cascade,
  questionnaire jsonb, sentiment text, notes text, conducted_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.hr_fnf_settlements (
  id uuid primary key default uuid_generate_v4(),
  separation_id uuid not null references public.hr_separations(id) on delete cascade,
  payable bigint not null default 0, recoverable bigint not null default 0, net bigint not null default 0,
  finance_handoff_ref uuid, status text not null default 'draft' check (status in ('draft','approved','paid')),
  approved_by uuid references public.profiles(id), created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);

-- Permissions
insert into public.permissions (perm_key, module, label) values
  ('hrms.recruitment.manage','hrms','Manage requisitions/candidates/offers'),
  ('hrms.recruitment.approve','hrms','Approve requisitions/offers'),
  ('hrms.recruitment.interview','hrms','Schedule interviews & submit feedback'),
  ('hrms.onboarding.manage','hrms','Manage onboarding checklists'),
  ('hrms.lifecycle.manage','hrms','Manage employee lifecycle & separations'),
  ('hrms.lifecycle.approve','hrms','Approve separations & F&F')
on conflict (perm_key) do nothing;
insert into public.role_permissions (role_key, perm_key, scope)
select r.role_key, p.perm_key, 'all' from (values ('super_admin'),('director')) r(role_key)
cross join public.permissions p where p.module='hrms' and (p.perm_key like 'hrms.recruitment%' or p.perm_key like 'hrms.onboarding%' or p.perm_key like 'hrms.lifecycle%')
on conflict do nothing;
insert into public.role_permissions (role_key, perm_key, scope) values
  ('hr','hrms.recruitment.manage','all'),('hr','hrms.recruitment.approve','all'),('hr','hrms.recruitment.interview','all'),('hr','hrms.onboarding.manage','all'),('hr','hrms.lifecycle.manage','all'),
  ('manager','hrms.recruitment.manage','all'),('manager','hrms.recruitment.interview','all'),
  ('auditor','hrms.recruitment.manage','all')
on conflict do nothing;

-- RLS + audit
do $$
declare t text;
  recruit text[] := array['hr_job_requisitions','hr_job_postings','hr_candidates','hr_candidate_applications','hr_interviews','hr_interview_feedback','hr_offers','hr_onboarding_templates'];
  selfemp text[] := array['hr_onboarding','hr_separations'];
  hronly text[] := array['hr_onboarding_tasks','hr_exit_interviews','hr_fnf_settlements'];
begin
  foreach t in array recruit loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format($p$create policy %I on public.%I for select to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role,'hr'::user_role,'auditor'::user_role]))$p$, t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($p$create policy %I on public.%I for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role,'manager'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role,'manager'::user_role]))$p$, t||'_write', t);
    execute format('drop trigger if exists %I on public.%I', 'trg_audit_'||t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function fn_audit_wave2()', 'trg_audit_'||t, t);
  end loop;
  foreach t in array selfemp loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format($p$create policy %I on public.%I for select to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role,'auditor'::user_role]) or employee_id = auth.uid())$p$, t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($p$create policy %I on public.%I for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role]))$p$, t||'_write', t);
    execute format('drop trigger if exists %I on public.%I', 'trg_audit_'||t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function fn_audit_wave2()', 'trg_audit_'||t, t);
  end loop;
  foreach t in array hronly loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format($p$create policy %I on public.%I for select to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role,'auditor'::user_role]))$p$, t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($p$create policy %I on public.%I for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role]))$p$, t||'_write', t);
    execute format('drop trigger if exists %I on public.%I', 'trg_audit_'||t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function fn_audit_wave2()', 'trg_audit_'||t, t);
  end loop;
end $$;
-- onboarding tasks: allow the employee to see their own via parent (supplementary OR policy)
drop policy if exists hr_onboarding_tasks_self on public.hr_onboarding_tasks;
create policy hr_onboarding_tasks_self on public.hr_onboarding_tasks for select to public using (
  exists (select 1 from public.hr_onboarding o where o.id = onboarding_id and o.employee_id = auth.uid()));

insert into public.hr_onboarding_templates (name, tasks) values
  ('Standard Onboarding', '["Collect documents","IT/email setup","Asset allocation","Policy acknowledgement","Induction"]'::jsonb)
on conflict do nothing;;
