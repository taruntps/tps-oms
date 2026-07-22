-- Migration 095 (HRMS M6 Performance Management). Applied to staging; additive/EXPAND. Review cycles, KRA/KPI goals, multi-stage reviews, increment/promotion recommendations; audit+RLS (self-scoped).
-- Migration 095 — HRMS M6: Performance Management. EXPAND only (additive).
-- Review cycles, KRA/KPI goals, multi-stage reviews, increment/promotion recommendations.
-- Recommendations feed M4 salary revision (link only). audit fn_audit_wave2. Reuses profiles.

create table if not exists public.hr_review_cycles (
  id uuid primary key default uuid_generate_v4(),
  name text not null, period_start date, period_end date,
  type text not null default 'annual' check (type in ('quarterly','annual','probation')),
  status text not null default 'open' check (status in ('open','in_review','calibration','closed')),
  created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.hr_goals (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  cycle_id uuid references public.hr_review_cycles(id) on delete cascade,
  category text not null default 'KRA' check (category in ('KRA','KPI','goal')),
  title text not null, weight numeric(5,2) not null default 0, target text,
  status text not null default 'active' check (status in ('active','achieved','partial','dropped')),
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists hr_goals_idx on public.hr_goals(employee_id, cycle_id);
create table if not exists public.hr_reviews (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  cycle_id uuid references public.hr_review_cycles(id) on delete cascade,
  stage text not null default 'self' check (stage in ('self','manager','calibration','final')),
  reviewer_id uuid references public.profiles(id), rating numeric(4,2), comments text,
  status text not null default 'draft' check (status in ('draft','submitted')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (employee_id, cycle_id, stage)
);
create table if not exists public.hr_recommendations (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  cycle_id uuid references public.hr_review_cycles(id),
  type text not null check (type in ('increment','promotion')), proposed_value text,
  status text not null default 'proposed' check (status in ('proposed','approved','rejected')),
  approved_by uuid references public.profiles(id), salary_revision_id uuid, created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);

insert into public.permissions (perm_key, module, label) values
  ('hrms.performance.manage','hrms','Manage review cycles / goals / calibration'),
  ('hrms.performance.review.self','hrms','Submit own self-review'),
  ('hrms.performance.review.manager','hrms','Submit manager reviews'),
  ('hrms.performance.view','hrms','View performance'),
  ('hrms.performance.recommend.approve','hrms','Approve increment/promotion recommendations')
on conflict (perm_key) do nothing;
insert into public.role_permissions (role_key, perm_key, scope)
select r.role_key, p.perm_key, 'all' from (values ('super_admin'),('director')) r(role_key)
cross join public.permissions p where p.module='hrms' and p.perm_key like 'hrms.performance%'
on conflict do nothing;
insert into public.role_permissions (role_key, perm_key, scope) values
  ('hr','hrms.performance.manage','all'),('hr','hrms.performance.view','all'),
  ('manager','hrms.performance.review.manager','all'),('manager','hrms.performance.view','all'),('manager','hrms.performance.review.self','all'),
  ('auditor','hrms.performance.view','all'),
  ('executive','hrms.performance.review.self','all'),('accounts','hrms.performance.review.self','all'),('hr','hrms.performance.review.self','all')
on conflict do nothing;

do $$
declare t text;
  self_tables text[] := array['hr_goals','hr_reviews','hr_recommendations'];
  cfg_tables text[] := array['hr_review_cycles'];
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
  foreach t in array cfg_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format($p$create policy %I on public.%I for select to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role,'hr'::user_role,'auditor'::user_role,'executive'::user_role,'accounts'::user_role]))$p$, t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($p$create policy %I on public.%I for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role]))$p$, t||'_write', t);
    execute format('drop trigger if exists %I on public.%I', 'trg_audit_'||t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function fn_audit_wave2()', 'trg_audit_'||t, t);
  end loop;
end $$;;
