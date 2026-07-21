-- Migration 090 — HRMS M3: Leave Management + configurable attendance-status master.
-- Applied to staging. EXPAND only (additive). Does NOT modify frozen M1/M2 tables.
-- Rules via hr_policy_settings. audit fn_audit_wave2. Encashment amount = bigint paise (Payroll computes later).

-- ══ Part A: Configurable attendance status / day-type masters (M3 enhancement) ══
-- Normalizes + makes CONFIGURABLE the status vocabulary that frozen M2 hr_attendance_days
-- carries as a CHECK constraint. M2 is NOT modified; a future expand-contract swap (CHECK→FK)
-- is deferred until a custom status must be stored on the frozen table.
create table if not exists public.hr_attendance_statuses (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique, label text not null,
  category text not null check (category in ('present','absent','leave','holiday','off','exception')),
  is_paid boolean not null default true, sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.hr_day_types (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique, label text not null,
  is_working boolean not null default true, sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.hr_attendance_statuses (code,label,category,is_paid,sort_order) values
  ('present','Present','present',true,1),('half_day','Half Day','present',true,2),
  ('absent','Absent','absent',false,3),('on_leave','On Leave','leave',true,4),
  ('holiday','Holiday','holiday',true,5),('weekly_off','Weekly Off','off',true,6),
  ('od','Outdoor Duty','present',true,7),('wfh','Work From Home','present',true,8),
  ('pending','Pending','exception',true,9)
on conflict (code) do nothing;
insert into public.hr_day_types (code,label,is_working,sort_order) values
  ('working','Working Day',true,1),('weekly_off','Weekly Off',false,2),('holiday','Holiday',false,3),
  ('leave','Leave',false,4),('od','Outdoor Duty',true,5),('wfh','Work From Home',true,6)
on conflict (code) do nothing;

-- ══ Part B: Leave Management ══
create table if not exists public.hr_leave_types (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique, name text not null,
  is_paid boolean not null default true, is_encashable boolean not null default false,
  requires_proof boolean not null default false, unit text not null default 'day' check (unit in ('day','half_day')),
  applies_to text not null default 'all' check (applies_to in ('all','male','female')),
  annual_quota numeric(6,2) not null default 0, carry_forward_cap numeric(6,2) not null default 0,
  config jsonb not null default '{}'::jsonb, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.hr_leave_types (code,name,is_paid,is_encashable,requires_proof,applies_to,annual_quota,carry_forward_cap) values
  ('CL','Casual Leave',true,false,false,'all',12,0),
  ('SL','Sick Leave',true,false,false,'all',12,12),
  ('EL','Earned Leave',true,true,false,'all',15,45),
  ('CO','Comp Off',true,false,false,'all',0,0),
  ('ML','Maternity Leave',true,false,true,'female',182,0),
  ('PL','Paternity Leave',true,false,false,'male',5,0),
  ('LWP','Leave Without Pay',false,false,false,'all',0,0)
on conflict (code) do nothing;

-- Ledger-based balance (signed quantity: accrual/opening/carry_forward/adjustment +, applied/encashment/lapse -)
create table if not exists public.hr_leave_ledger (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  leave_type_id uuid not null references public.hr_leave_types(id),
  entry_type text not null check (entry_type in ('opening','accrual','carry_forward','applied','reversal','encashment','adjustment','lapse')),
  quantity numeric(6,2) not null, entry_date date not null default current_date,
  ref_type text, ref_id uuid, note text, created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create index if not exists hr_leave_ledger_idx on public.hr_leave_ledger(employee_id, leave_type_id, entry_date);

create table if not exists public.hr_leave_requests (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  leave_type_id uuid not null references public.hr_leave_types(id),
  from_date date not null, to_date date not null, days numeric(5,2) not null default 1,
  is_half_day boolean not null default false, half_session text check (half_session in ('first','second')),
  reason text, status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approver_id uuid references public.profiles(id), decided_at timestamptz, decision_note text,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create index if not exists hr_leave_req_idx on public.hr_leave_requests(employee_id, from_date);

create table if not exists public.hr_holidays (
  id uuid primary key default uuid_generate_v4(),
  holiday_date date not null, name text not null,
  holiday_type text not null default 'gazetted' check (holiday_type in ('gazetted','restricted','optional')),
  branch_id uuid references public.office_locations(id), calendar_year int not null,
  is_active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.hr_restricted_holiday_picks (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  holiday_id uuid not null references public.hr_holidays(id), calendar_year int not null,
  created_at timestamptz not null default now(), unique (employee_id, holiday_id)
);
create table if not exists public.hr_comp_off (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  earned_date date not null, source text check (source in ('overtime','holiday_work','weekly_off_work')),
  source_ref uuid, expires_on date, status text not null default 'available' check (status in ('available','used','expired')),
  used_ref uuid, created_at timestamptz not null default now()
);
create table if not exists public.hr_leave_encashments (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  leave_type_id uuid not null references public.hr_leave_types(id), days numeric(6,2) not null,
  status text not null default 'requested' check (status in ('requested','approved','paid','rejected')),
  amount bigint, requested_on date not null default current_date,
  approver_id uuid references public.profiles(id), decided_at timestamptz,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);

-- Balance resolver (sum signed ledger for a year)
create or replace function public.get_leave_balance(p_employee uuid, p_leave_type uuid, p_year int default null)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(quantity),0)::numeric from hr_leave_ledger
  where employee_id = p_employee and leave_type_id = p_leave_type
    and (p_year is null or extract(year from entry_date)::int = p_year);
$$;

-- ══ Permissions ══
insert into public.permissions (perm_key, module, label) values
  ('hrms.leave.apply','hrms','Apply for / cancel own leave (ESS)'),
  ('hrms.leave.view','hrms','View leave (team/all)'),
  ('hrms.leave.approve','hrms','Approve/reject leave'),
  ('hrms.leave.manage','hrms','Manage leave types/holidays/balances/encashment')
on conflict (perm_key) do nothing;
insert into public.role_permissions (role_key, perm_key, scope)
select r.role_key, p.perm_key, 'all' from (values ('super_admin'),('director')) r(role_key)
cross join public.permissions p where p.module='hrms' and p.perm_key like 'hrms.leave%'
on conflict do nothing;
insert into public.role_permissions (role_key, perm_key, scope) values
  ('hr','hrms.leave.view','all'),('hr','hrms.leave.approve','all'),('hr','hrms.leave.manage','all'),('hr','hrms.leave.apply','all'),
  ('manager','hrms.leave.view','all'),('manager','hrms.leave.approve','all'),('manager','hrms.leave.apply','all'),
  ('auditor','hrms.leave.view','all'),
  ('executive','hrms.leave.apply','all'),('accounts','hrms.leave.apply','all')
on conflict do nothing;

-- ══ RLS + audit ══
do $$
declare t text;
  self_tables text[] := array['hr_leave_requests','hr_leave_ledger','hr_restricted_holiday_picks','hr_comp_off','hr_leave_encashments'];
  config_tables text[] := array['hr_attendance_statuses','hr_day_types','hr_leave_types','hr_holidays'];
begin
  foreach t in array self_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format($p$create policy %I on public.%I for select to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role,'hr'::user_role,'auditor'::user_role]) or employee_id = auth.uid())$p$, t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_ins', t);
    execute format($p$create policy %I on public.%I for insert to public with check (employee_id = auth.uid() or auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role,'manager'::user_role]))$p$, t||'_ins', t);
    execute format('drop policy if exists %I on public.%I', t||'_upd', t);
    execute format($p$create policy %I on public.%I for update to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role,'hr'::user_role]) or employee_id = auth.uid())$p$, t||'_upd', t);
    execute format('drop trigger if exists %I on public.%I', 'trg_audit_'||t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function fn_audit_wave2()', 'trg_audit_'||t, t);
  end loop;
  foreach t in array config_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format($p$create policy %I on public.%I for select to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role,'hr'::user_role,'auditor'::user_role,'executive'::user_role,'accounts'::user_role]))$p$, t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($p$create policy %I on public.%I for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role]))$p$, t||'_write', t);
    execute format('drop trigger if exists %I on public.%I', 'trg_audit_'||t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function fn_audit_wave2()', 'trg_audit_'||t, t);
  end loop;
end $$;

-- ══ Seed configurable leave policy defaults + a starter Punjab holiday list (editable) ══
insert into public.hr_policy_settings (scope_type, key, value, note) values
  ('company','leave.year_basis','"financial_year"'::jsonb,'Leave year = Apr-Mar'),
  ('company','leave.min_unit','0.5'::jsonb,'Minimum leave unit (half day)'),
  ('company','leave.notice_days','2'::jsonb,'Advance notice for planned leave'),
  ('company','leave.sandwich','true'::jsonb,'Sandwich rule enabled'),
  ('company','leave.allow_negative','false'::jsonb,'Disallow negative balance (except LWP)'),
  ('company','holiday.restricted_quota','2'::jsonb,'Restricted holidays per employee/year')
on conflict do nothing;
insert into public.hr_holidays (holiday_date, name, holiday_type, calendar_year) values
  ('2026-01-26','Republic Day','gazetted',2026),
  ('2026-08-15','Independence Day','gazetted',2026),
  ('2026-10-02','Gandhi Jayanti','gazetted',2026)
on conflict do nothing;
