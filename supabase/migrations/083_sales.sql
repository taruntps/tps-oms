-- Migration 083_sales (Wave 2). Applied to staging; additive/expand-contract.
-- Migration 083 — Sales (Wave 2, EXPAND). Deals (from CRM leads) → quotations → orders,
-- with handoffs to Operations (project) and Finance (invoice). Money = bigint paise.

create table if not exists public.sales_deal_stages (
  stage_key text primary key, label text not null, sort_order int not null default 100,
  is_won boolean not null default false, is_lost boolean not null default false
);
insert into public.sales_deal_stages (stage_key,label,sort_order,is_won,is_lost) values
  ('qualification','Qualification',10,false,false),
  ('proposal','Proposal',20,false,false),
  ('negotiation','Negotiation',30,false,false),
  ('won','Won',40,true,false),
  ('lost','Lost',50,false,true)
on conflict (stage_key) do nothing;

create table if not exists public.sales_services (
  id uuid primary key default uuid_generate_v4(),
  code text unique,
  name text not null,
  category text,
  default_fee bigint not null default 0,      -- paise (consulting fee)
  hsn_sac text,
  gst_rate numeric(5,2) not null default 18.00,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.sales_services (code, name, category, default_fee, hsn_sac) values
  ('FSSAI_NEW','FSSAI New Application','FSSAI',0,'998311'),
  ('FSSAI_RENEWAL','FSSAI Renewal','FSSAI',0,'998311'),
  ('FSSAI_MODIFICATION','FSSAI Modification','FSSAI',0,'998311'),
  ('ANNUAL_RETURN','FSSAI Annual Return','FSSAI',0,'998311'),
  ('ISO_CONSULTING','ISO Consulting','ISO',0,'998311'),
  ('SOI_LABEL','SOI / Label Review','Compliance',0,'998311')
on conflict (code) do nothing;

create table if not exists public.sales_deals (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references public.crm_leads(id),
  client_id uuid references public.clients(id),
  title text not null,
  stage_key text not null default 'qualification' references public.sales_deal_stages(stage_key),
  status text not null default 'open' check (status in ('open','won','lost')),
  owner_id uuid references public.profiles(id),
  amount bigint not null default 0,           -- paise (consulting fee expected)
  expected_close_date date,
  lost_reason text,
  project_id uuid references public.projects(id),  -- set on won → Operations handoff
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sales_deals_stage_idx on public.sales_deals(stage_key);
create index if not exists sales_deals_client_idx on public.sales_deals(client_id);

create table if not exists public.sales_deal_stage_history (
  id uuid primary key default uuid_generate_v4(),
  deal_id uuid not null references public.sales_deals(id) on delete cascade,
  from_stage text, to_stage text not null,
  changed_by uuid references public.profiles(id), changed_at timestamptz not null default now()
);

create table if not exists public.sales_quotations (
  id uuid primary key default uuid_generate_v4(),
  deal_id uuid not null references public.sales_deals(id) on delete cascade,
  quote_no text,
  version int not null default 1,
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected','expired')),
  valid_until date,
  subtotal bigint not null default 0,
  tax_total bigint not null default 0,
  discount_total bigint not null default 0,
  grand_total bigint not null default 0,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (deal_id, version)
);
create table if not exists public.sales_quotation_lines (
  id uuid primary key default uuid_generate_v4(),
  quotation_id uuid not null references public.sales_quotations(id) on delete cascade,
  service_id uuid references public.sales_services(id),
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_price bigint not null default 0,       -- paise
  discount_percent numeric(5,2) not null default 0,
  gst_rate numeric(5,2) not null default 18.00,
  hsn_sac text,
  line_total bigint not null default 0        -- paise (incl tax)
);
create index if not exists sales_quotation_lines_idx on public.sales_quotation_lines(quotation_id);

create table if not exists public.sales_orders (
  id uuid primary key default uuid_generate_v4(),
  deal_id uuid references public.sales_deals(id),
  client_id uuid references public.clients(id),
  quotation_id uuid references public.sales_quotations(id),
  order_no text,
  status text not null default 'confirmed' check (status in ('confirmed','delivered','cancelled')),
  total bigint not null default 0,            -- paise
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists public.sales_handoff_log (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references public.sales_orders(id) on delete cascade,
  target text not null check (target in ('operations','finance')),
  ref_id uuid,
  status text not null default 'done' check (status in ('pending','done','failed')),
  detail text,
  created_at timestamptz not null default now()
);

-- Permission keys
insert into public.permissions (perm_key, module, label) values
  ('sales.deal.view','sales','View deals'),
  ('sales.deal.manage','sales','Create/edit deals'),
  ('sales.deal.close','sales','Win/lose deals'),
  ('sales.quotation.manage','sales','Create/send quotations'),
  ('sales.quotation.approve','sales','Approve quotations'),
  ('sales.order.manage','sales','Create orders / handoff'),
  ('sales.service.manage','sales','Manage service catalogue & pricing')
on conflict (perm_key) do nothing;
insert into public.role_permissions (role_key, perm_key, scope)
select r.role_key, p.perm_key, 'all' from (values ('super_admin'),('director')) r(role_key)
cross join public.permissions p where p.module='sales' on conflict do nothing;
insert into public.role_permissions (role_key, perm_key, scope)
select 'manager', perm_key, 'all' from public.permissions where module='sales' on conflict do nothing;
insert into public.role_permissions (role_key, perm_key, scope) values
  ('executive','sales.deal.view','own'),('executive','sales.deal.manage','own'),
  ('executive','sales.quotation.manage','own')
on conflict do nothing;

-- RLS (auth_role pattern)
do $$ declare t text; begin
  foreach t in array array['sales_deal_stages','sales_services','sales_deals','sales_deal_stage_history','sales_quotations','sales_quotation_lines','sales_orders','sales_handoff_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format('create policy %I on public.%I for select to public using (auth.uid() is not null)', t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($p$create policy %I on public.%I for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role,'executive'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role,'executive'::user_role]))$p$, t||'_write', t);
  end loop;
end $$;
