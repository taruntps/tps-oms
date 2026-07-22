-- Migration 097 (HRMS M8 Assets). Applied to staging; additive/EXPAND. Asset register + issue/return allocations; audit+RLS (self view own allocations).
-- Migration 097 — HRMS M8: Asset Management. EXPAND only (additive).
-- Asset register + issue/return (acknowledgement); exit clearance reads this. audit fn_audit_wave2.
create table if not exists public.hr_assets (
  id uuid primary key default uuid_generate_v4(),
  category text not null default 'laptop', asset_tag text, description text, serial_no text,
  purchase_date date, cost bigint not null default 0,
  status text not null default 'in_stock' check (status in ('in_stock','issued','repair','retired')),
  license_expiry date, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.hr_asset_allocations (
  id uuid primary key default uuid_generate_v4(),
  asset_id uuid not null references public.hr_assets(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  issued_on date not null default current_date, returned_on date,
  condition_out text, condition_in text, ack_document_id uuid,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create index if not exists hr_asset_alloc_idx on public.hr_asset_allocations(employee_id, asset_id);

insert into public.permissions (perm_key, module, label) values
  ('hrms.asset.manage','hrms','Manage asset register & allocations'),
  ('hrms.asset.view.self','hrms','View own assigned assets (ESS)')
on conflict (perm_key) do nothing;
insert into public.role_permissions (role_key, perm_key, scope)
select r.role_key, p.perm_key, 'all' from (values ('super_admin'),('director')) r(role_key)
cross join public.permissions p where p.module='hrms' and p.perm_key like 'hrms.asset%'
on conflict do nothing;
insert into public.role_permissions (role_key, perm_key, scope) values
  ('hr','hrms.asset.manage','all'),('hr','hrms.asset.view.self','all'),
  ('manager','hrms.asset.view.self','all'),('auditor','hrms.asset.manage','all'),
  ('executive','hrms.asset.view.self','all'),('accounts','hrms.asset.view.self','all')
on conflict do nothing;

do $$
declare t text;
begin
  execute 'alter table public.hr_assets enable row level security';
  drop policy if exists hr_assets_read on public.hr_assets;
  create policy hr_assets_read on public.hr_assets for select to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role,'hr'::user_role,'auditor'::user_role]));
  drop policy if exists hr_assets_write on public.hr_assets;
  create policy hr_assets_write on public.hr_assets for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role]));
  drop trigger if exists trg_audit_hr_assets on public.hr_assets;
  create trigger trg_audit_hr_assets after insert or update or delete on public.hr_assets for each row execute function fn_audit_wave2();

  execute 'alter table public.hr_asset_allocations enable row level security';
  drop policy if exists hr_asset_allocations_read on public.hr_asset_allocations;
  create policy hr_asset_allocations_read on public.hr_asset_allocations for select to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role,'hr'::user_role,'auditor'::user_role]) or employee_id = auth.uid());
  drop policy if exists hr_asset_allocations_write on public.hr_asset_allocations;
  create policy hr_asset_allocations_write on public.hr_asset_allocations for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role]));
  drop trigger if exists trg_audit_hr_asset_allocations on public.hr_asset_allocations;
  create trigger trg_audit_hr_asset_allocations after insert or update or delete on public.hr_asset_allocations for each row execute function fn_audit_wave2();
end $$;;
