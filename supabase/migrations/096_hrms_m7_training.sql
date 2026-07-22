-- Migration 096 (HRMS M7 Training). Applied to staging; additive/EXPAND. Trainings, enrolments, certifications (expiry); audit+RLS (self-scoped enrolments/certs).
-- Migration 096 — HRMS M7: Training & Development. EXPAND only (additive).
-- Training calendar, enrolments, certification tracking (expiry reminders). audit fn_audit_wave2.
create table if not exists public.hr_trainings (
  id uuid primary key default uuid_generate_v4(),
  title text not null, type text not null default 'internal' check (type in ('internal','external')),
  trainer text, start_date date, end_date date, cost bigint not null default 0,
  status text not null default 'planned' check (status in ('planned','ongoing','completed','cancelled')),
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.hr_training_enrolments (
  id uuid primary key default uuid_generate_v4(),
  training_id uuid not null references public.hr_trainings(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'nominated' check (status in ('nominated','attended','completed','no_show')),
  score numeric(5,2), created_at timestamptz not null default now(), unique (training_id, employee_id)
);
create table if not exists public.hr_certifications (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  name text not null, authority text, issued_on date, expires_on date, document_id uuid,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create index if not exists hr_cert_expiry_idx on public.hr_certifications(expires_on);

insert into public.permissions (perm_key, module, label) values
  ('hrms.training.manage','hrms','Manage trainings/enrolments/certifications'),
  ('hrms.training.view','hrms','View training'),
  ('hrms.training.view.self','hrms','View own trainings/certifications (ESS)')
on conflict (perm_key) do nothing;
insert into public.role_permissions (role_key, perm_key, scope)
select r.role_key, p.perm_key, 'all' from (values ('super_admin'),('director')) r(role_key)
cross join public.permissions p where p.module='hrms' and p.perm_key like 'hrms.training%'
on conflict do nothing;
insert into public.role_permissions (role_key, perm_key, scope) values
  ('hr','hrms.training.manage','all'),('hr','hrms.training.view','all'),('hr','hrms.training.view.self','all'),
  ('manager','hrms.training.view','all'),('manager','hrms.training.view.self','all'),
  ('auditor','hrms.training.view','all'),
  ('executive','hrms.training.view.self','all'),('accounts','hrms.training.view.self','all')
on conflict do nothing;

do $$
declare t text;
  cfg text[] := array['hr_trainings'];
  selfemp text[] := array['hr_training_enrolments','hr_certifications'];
begin
  foreach t in array cfg loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format($p$create policy %I on public.%I for select to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role,'hr'::user_role,'auditor'::user_role,'executive'::user_role,'accounts'::user_role]))$p$, t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($p$create policy %I on public.%I for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role]))$p$, t||'_write', t);
    execute format('drop trigger if exists %I on public.%I', 'trg_audit_'||t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function fn_audit_wave2()', 'trg_audit_'||t, t);
  end loop;
  foreach t in array selfemp loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format($p$create policy %I on public.%I for select to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role,'hr'::user_role,'auditor'::user_role]) or employee_id = auth.uid())$p$, t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($p$create policy %I on public.%I for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role]))$p$, t||'_write', t);
    execute format('drop trigger if exists %I on public.%I', 'trg_audit_'||t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function fn_audit_wave2()', 'trg_audit_'||t, t);
  end loop;
end $$;;
