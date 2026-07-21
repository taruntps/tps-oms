-- Migration 088 — HRMS Milestone M1: Employee Master + minimal Foundation + config framework.
-- Applied to staging. EXPAND only (additive). Reuses profiles, employee_details,
-- organizations, office_locations. Nothing hardcoded: policy resolved via get_hr_policy.
-- audit via fn_audit_wave2. RLS via auth_role().

-- ── Part 1: Configurable HR policy framework ──
create table if not exists public.hr_policy_settings (
  id uuid primary key default uuid_generate_v4(),
  scope_type text not null default 'company' check (scope_type in ('company','branch','department','grade','employee')),
  scope_id uuid,                                   -- null for company scope
  key text not null,                               -- e.g. attendance.shift.general
  value jsonb not null,
  effective_from date not null default current_date,
  effective_to date,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hr_policy_settings_key_idx on public.hr_policy_settings(key, scope_type);

-- ── Part 2: Minimal org masters (Employee Master references) ──
create table if not exists public.hr_grades (
  id uuid primary key default uuid_generate_v4(),
  code text not null, name text not null, level int, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.hr_departments (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references public.organizations(id),
  code text not null, name text not null, parent_id uuid references public.hr_departments(id),
  head_id uuid references public.profiles(id), is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.hr_designations (
  id uuid primary key default uuid_generate_v4(),
  code text not null, name text not null, grade_id uuid references public.hr_grades(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.hr_employment_types (
  id uuid primary key default uuid_generate_v4(),
  code text not null, name text not null, is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Part 3: profiles FK-shadow (additive; existing text designation/department kept for back-compat) ──
alter table public.profiles add column if not exists department_id uuid references public.hr_departments(id);
alter table public.profiles add column if not exists designation_id uuid references public.hr_designations(id);
alter table public.profiles add column if not exists grade_id uuid references public.hr_grades(id);
alter table public.profiles add column if not exists employment_type_id uuid references public.hr_employment_types(id);
alter table public.profiles add column if not exists branch_location_id uuid references public.office_locations(id);
alter table public.profiles add column if not exists reports_to uuid references public.profiles(id);

-- ── employee_details additive (extend HR PII record) ──
alter table public.employee_details add column if not exists gender text;
alter table public.employee_details add column if not exists marital_status text;
alter table public.employee_details add column if not exists blood_group text;
alter table public.employee_details add column if not exists nationality text default 'Indian';
alter table public.employee_details add column if not exists photo_url text;
alter table public.employee_details add column if not exists signature_url text;
alter table public.employee_details add column if not exists probation_end_date date;
alter table public.employee_details add column if not exists confirmation_date date;
alter table public.employee_details add column if not exists employee_status text default 'active'
  check (employee_status in ('pre_joining','probation','confirmed','notice','suspended','exited','active'));

-- ── Part 4: Employee child / history tables (keyed to profiles.id) ──
create table if not exists public.hr_employee_bank (
  id uuid primary key default uuid_generate_v4(), employee_id uuid not null references public.profiles(id) on delete cascade,
  account_name text, account_no text, ifsc text, bank_name text, branch text, is_primary boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.hr_employee_statutory_ids (
  id uuid primary key default uuid_generate_v4(), employee_id uuid not null references public.profiles(id) on delete cascade,
  uan text, pf_no text, esi_no text, pran text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.hr_employee_nominees (
  id uuid primary key default uuid_generate_v4(), employee_id uuid not null references public.profiles(id) on delete cascade,
  name text not null, relation text, share_percent numeric(5,2), scheme text, created_at timestamptz not null default now());
create table if not exists public.hr_emergency_contacts (
  id uuid primary key default uuid_generate_v4(), employee_id uuid not null references public.profiles(id) on delete cascade,
  name text not null, relation text, phone text, address text, is_primary boolean not null default false, created_at timestamptz not null default now());
create table if not exists public.hr_employee_qualifications (
  id uuid primary key default uuid_generate_v4(), employee_id uuid not null references public.profiles(id) on delete cascade,
  degree text not null, specialization text, institution text, year_completed int, grade text, document_id uuid, created_at timestamptz not null default now());
create table if not exists public.hr_employee_experience (
  id uuid primary key default uuid_generate_v4(), employee_id uuid not null references public.profiles(id) on delete cascade,
  company text not null, designation text, from_date date, to_date date, ctc bigint, document_id uuid, created_at timestamptz not null default now());
create table if not exists public.hr_employee_skills (
  id uuid primary key default uuid_generate_v4(), employee_id uuid not null references public.profiles(id) on delete cascade,
  skill text not null, proficiency text, created_at timestamptz not null default now());
create table if not exists public.hr_employee_family (
  id uuid primary key default uuid_generate_v4(), employee_id uuid not null references public.profiles(id) on delete cascade,
  name text not null, relation text, date_of_birth date, is_dependent boolean, created_at timestamptz not null default now());
create table if not exists public.hr_employee_medical (
  id uuid primary key default uuid_generate_v4(), employee_id uuid not null references public.profiles(id) on delete cascade,
  condition text, notes text, blood_group text, created_at timestamptz not null default now());
create table if not exists public.hr_employee_status_events (
  id uuid primary key default uuid_generate_v4(), employee_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('joining','probation','confirmation','transfer','promotion','salary_revision','warning','suspension','resignation','exit')),
  effective_date date not null default current_date, from_value text, to_value text,
  approved_by uuid references public.profiles(id), notes text, document_id uuid, created_by uuid references public.profiles(id), created_at timestamptz not null default now());
create index if not exists hr_emp_status_events_idx on public.hr_employee_status_events(employee_id, effective_date desc);

-- ── Part 5: get_hr_policy resolver (most-specific-wins, effective-dated) ──
create or replace function public.get_hr_policy(p_key text, p_employee_id uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with emp as (select department_id, grade_id, branch_location_id from profiles where id = p_employee_id)
  select s.value from hr_policy_settings s left join emp on true
  where s.key = p_key
    and s.effective_from <= current_date and (s.effective_to is null or s.effective_to >= current_date)
    and ( s.scope_type = 'company'
       or (s.scope_type='employee'   and s.scope_id = p_employee_id)
       or (s.scope_type='grade'      and s.scope_id = emp.grade_id)
       or (s.scope_type='department' and s.scope_id = emp.department_id)
       or (s.scope_type='branch'     and s.scope_id = emp.branch_location_id) )
  order by case s.scope_type when 'employee' then 1 when 'grade' then 2 when 'department' then 3 when 'branch' then 4 else 5 end,
           s.effective_from desc
  limit 1;
$$;

-- ── Part 6: Permissions ──
insert into public.permissions (perm_key, module, label) values
  ('hrms.config.manage','hrms','Manage HR configuration & policies'),
  ('hrms.employee.view','hrms','View employees'),
  ('hrms.employee.manage','hrms','Create/edit employees'),
  ('hrms.employee.view.self','hrms','View own employee record (ESS)'),
  ('hrms.employee.sensitive.view','hrms','View sensitive employee data (bank/statutory/medical)')
on conflict (perm_key) do nothing;
insert into public.role_permissions (role_key, perm_key, scope)
select r.role_key, p.perm_key, 'all' from (values ('super_admin'),('director')) r(role_key)
cross join public.permissions p where p.module='hrms' on conflict do nothing;
insert into public.role_permissions (role_key, perm_key, scope) values
  ('hr','hrms.config.manage','all'),('hr','hrms.employee.view','all'),('hr','hrms.employee.manage','all'),('hr','hrms.employee.sensitive.view','all'),
  ('manager','hrms.employee.view','all'),
  ('auditor','hrms.employee.view','all'),
  ('executive','hrms.employee.view.self','all'),('accounts','hrms.employee.view.self','all')
on conflict do nothing;

-- ── Part 7: RLS + audit triggers ──
do $$
declare t text;
  master_tables text[] := array['hr_policy_settings','hr_grades','hr_departments','hr_designations','hr_employment_types'];
  emp_tables text[] := array['hr_employee_bank','hr_employee_statutory_ids','hr_employee_nominees','hr_emergency_contacts','hr_employee_qualifications','hr_employee_experience','hr_employee_skills','hr_employee_family','hr_employee_medical','hr_employee_status_events'];
begin
  -- Master/config: read by HR-relevant roles; write by hr/director/super_admin
  foreach t in array master_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format($p$create policy %I on public.%I for select to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role,'hr'::user_role,'auditor'::user_role,'accounts'::user_role,'executive'::user_role]))$p$, t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($p$create policy %I on public.%I for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role]))$p$, t||'_write', t);
    execute format('drop trigger if exists %I on public.%I', 'trg_audit_'||t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function fn_audit_wave2()', 'trg_audit_'||t, t);
  end loop;
  -- Employee child: read by hr/director/super_admin/auditor + self; write by hr/director/super_admin
  foreach t in array emp_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format($p$create policy %I on public.%I for select to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role,'auditor'::user_role]) or employee_id = auth.uid())$p$, t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($p$create policy %I on public.%I for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role]))$p$, t||'_write', t);
    execute format('drop trigger if exists %I on public.%I', 'trg_audit_'||t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function fn_audit_wave2()', 'trg_audit_'||t, t);
  end loop;
end $$;

-- ── Part 8: Seed configurable DEFAULTS (editable in Administration; nothing hardcoded) ──
insert into public.hr_employment_types (code, name) values
  ('permanent','Permanent'),('contract','Contract'),('intern','Intern'),('consultant','Consultant'),('probation','Probationer')
on conflict do nothing;
insert into public.hr_policy_settings (scope_type, key, value, note) values
  ('company','attendance.shift.general','{"start":"09:00","end":"18:00","break_minutes":60,"core_start":"11:00","core_end":"16:00","grace_late_min":10,"grace_early_min":10}'::jsonb,'Default office timing (editable)'),
  ('company','attendance.working_days','["mon","tue","wed","thu","fri"]'::jsonb,'Default 5-day week'),
  ('company','attendance.weekly_off','["sat","sun"]'::jsonb,'Default weekly off'),
  ('company','attendance.full_day_hours','8'::jsonb,'Full-day minimum hours'),
  ('company','lifecycle.probation_months','6'::jsonb,'Default probation'),
  ('company','lifecycle.empcode_format','{"prefix":"T","pad":3}'::jsonb,'Employee code format')
on conflict do nothing;
