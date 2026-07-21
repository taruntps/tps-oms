-- Migration 089 — HRMS Milestone M2: Attendance. Applied to staging. EXPAND only (additive).
-- Reuses attendance_punches (raw punch, immutable) + attendance_days (VIEW rollup, untouched)
-- + attendance_settings (legacy). Evaluated daily status lives in a NEW hr_attendance_days
-- table (attendance_days is a VIEW and cannot be altered). Rules via hr_policy_settings +
-- get_hr_policy. audit fn_audit_wave2.

-- ── Shift catalogue + effective-dated allocation ──
create table if not exists public.hr_shifts (
  id uuid primary key default uuid_generate_v4(),
  code text not null, name text not null,
  start_time time not null, end_time time not null,
  break_minutes int not null default 60, is_night boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.hr_shift_allocations (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  shift_id uuid not null references public.hr_shifts(id),
  effective_from date not null default current_date, effective_to date,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create index if not exists hr_shift_alloc_idx on public.hr_shift_allocations(employee_id, effective_from desc);

-- ── HR-evaluated daily attendance (distinct from the punch-derived attendance_days VIEW) ──
create table if not exists public.hr_attendance_days (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  shift_id uuid references public.hr_shifts(id),
  day_type text check (day_type in ('working','weekly_off','holiday','leave','od','wfh')),
  status text check (status in ('present','absent','half_day','on_leave','holiday','weekly_off','od','wfh','pending')),
  first_in timestamptz, last_out timestamptz, worked_minutes numeric,
  late_minutes int not null default 0, early_out_minutes int not null default 0, ot_minutes int not null default 0,
  is_regularized boolean not null default false, remarks text, evaluated_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (employee_id, work_date)
);
create index if not exists hr_attendance_days_idx on public.hr_attendance_days(employee_id, work_date desc);

-- ── Regularization (employee-raised) + correction (HR-applied) ──
create table if not exists public.hr_attendance_regularizations (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null, kind text not null default 'missed_punch'
    check (kind in ('missed_punch','wrong_punch','forgot','other')),
  requested_in timestamptz, requested_out timestamptz, reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approver_id uuid references public.profiles(id), decided_at timestamptz, decision_note text,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create index if not exists hr_att_reg_idx on public.hr_attendance_regularizations(employee_id, work_date);
create table if not exists public.hr_attendance_corrections (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null, field text, old_value text, new_value text, reason text,
  corrected_by uuid references public.profiles(id), created_at timestamptz not null default now()
);

-- ── Outdoor Duty / Work From Home requests ──
create table if not exists public.hr_outdoor_duty (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null default 'od' check (mode in ('od','wfh')),
  from_date date not null, to_date date not null, purpose text, location text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approver_id uuid references public.profiles(id), decided_at timestamptz,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);

-- ── Overtime (pre-approval + actuals) ──
create table if not exists public.hr_overtime (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null, minutes int not null default 0, reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  compensation text check (compensation in ('paid','comp_off')),
  approver_id uuid references public.profiles(id), decided_at timestamptz,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);

-- ── Biometric device ingestion (schema ready; adapter deferred until a device exists) ──
create table if not exists public.hr_attendance_device_events (
  id uuid primary key default uuid_generate_v4(),
  device_id text, employee_code text, employee_id uuid references public.profiles(id),
  event_at timestamptz not null, direction text, raw jsonb, processed boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── get_effective_shift resolver (allocated shift for a date, else null → caller falls back to policy) ──
create or replace function public.get_effective_shift(p_employee_id uuid, p_date date default current_date)
returns uuid language sql stable security definer set search_path = public as $$
  select shift_id from hr_shift_allocations
  where employee_id = p_employee_id and effective_from <= p_date
    and (effective_to is null or effective_to >= p_date)
  order by effective_from desc limit 1;
$$;

-- ── Permissions ──
insert into public.permissions (perm_key, module, label) values
  ('hrms.attendance.self','hrms','Punch & view own attendance (ESS)'),
  ('hrms.attendance.view','hrms','View attendance (team/all)'),
  ('hrms.attendance.manage','hrms','Manage/correct attendance'),
  ('hrms.attendance.approve','hrms','Approve regularization/OD/WFH/OT'),
  ('hrms.shift.manage','hrms','Manage shifts & allocations')
on conflict (perm_key) do nothing;
insert into public.role_permissions (role_key, perm_key, scope)
select r.role_key, p.perm_key, 'all' from (values ('super_admin'),('director')) r(role_key)
cross join public.permissions p
where p.module='hrms' and (p.perm_key like 'hrms.attendance%' or p.perm_key='hrms.shift.manage')
on conflict do nothing;
insert into public.role_permissions (role_key, perm_key, scope) values
  ('hr','hrms.attendance.view','all'),('hr','hrms.attendance.manage','all'),('hr','hrms.attendance.approve','all'),('hr','hrms.shift.manage','all'),('hr','hrms.attendance.self','all'),
  ('manager','hrms.attendance.view','all'),('manager','hrms.attendance.approve','all'),('manager','hrms.attendance.self','all'),
  ('auditor','hrms.attendance.view','all'),
  ('executive','hrms.attendance.self','all'),('accounts','hrms.attendance.self','all')
on conflict do nothing;

-- ── RLS + audit ──
do $$
declare t text;
  request_tables text[] := array['hr_attendance_regularizations','hr_outdoor_duty','hr_overtime'];
  selfread_tables text[] := array['hr_attendance_days'];
  admin_tables text[] := array['hr_shifts','hr_shift_allocations','hr_attendance_corrections','hr_attendance_device_events'];
begin
  foreach t in array request_tables loop
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
  foreach t in array selfread_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format($p$create policy %I on public.%I for select to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role,'hr'::user_role,'auditor'::user_role]) or employee_id = auth.uid())$p$, t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($p$create policy %I on public.%I for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role]))$p$, t||'_write', t);
    execute format('drop trigger if exists %I on public.%I', 'trg_audit_'||t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function fn_audit_wave2()', 'trg_audit_'||t, t);
  end loop;
  foreach t in array admin_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format($p$create policy %I on public.%I for select to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role,'hr'::user_role,'auditor'::user_role,'executive'::user_role,'accounts'::user_role]))$p$, t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($p$create policy %I on public.%I for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role]))$p$, t||'_write', t);
    execute format('drop trigger if exists %I on public.%I', 'trg_audit_'||t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function fn_audit_wave2()', 'trg_audit_'||t, t);
  end loop;
end $$;

-- ── Seed default shift + attendance rule policies (editable in Administration) ──
insert into public.hr_shifts (code, name, start_time, end_time, break_minutes) values
  ('general','General Shift','09:00','18:00',60)
on conflict do nothing;
insert into public.hr_policy_settings (scope_type, key, value, note) values
  ('company','attendance.late_to_halfday','3'::jsonb,'N late marks = half-day LOP'),
  ('company','attendance.regularization_cap','2'::jsonb,'Max regularizations per month'),
  ('company','attendance.awol_alert_days','3'::jsonb,'Consecutive AWOL days before HR alert'),
  ('company','attendance.ot_enabled','true'::jsonb,'Overtime allowed (pre-approved)'),
  ('company','attendance.wfh_enabled','true'::jsonb,'Work from home allowed'),
  ('company','attendance.od_enabled','true'::jsonb,'Outdoor duty allowed')
on conflict do nothing;
