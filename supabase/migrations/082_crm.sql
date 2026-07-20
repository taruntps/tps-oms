-- Migration 082_crm (Wave 2). Applied to staging; additive/expand-contract.
-- Migration 082 — CRM (Wave 2, EXPAND). Absorbs existing clients/referrals additively.
-- Adds leads, contacts, activities, pipeline. Money = bigint paise. RLS via existing auth_role().

create table if not exists public.crm_pipeline_stages (
  stage_key text primary key,
  label text not null,
  sort_order int not null default 100,
  is_won boolean not null default false,
  is_lost boolean not null default false
);
insert into public.crm_pipeline_stages (stage_key, label, sort_order, is_won, is_lost) values
  ('new','New',10,false,false),
  ('qualified','Qualified',20,false,false),
  ('proposal','Proposal',30,false,false),
  ('negotiation','Negotiation',40,false,false),
  ('won','Won',50,true,false),
  ('lost','Lost',60,false,true)
on conflict (stage_key) do nothing;

create table if not exists public.crm_leads (
  id uuid primary key default uuid_generate_v4(),
  company_name text not null,
  contact_person text,
  phone text,
  email text,
  source text,                       -- website | referral | marketing | walk_in | other
  stage_key text not null default 'new' references public.crm_pipeline_stages(stage_key),
  status text not null default 'open' check (status in ('open','won','lost')),
  owner_id uuid references public.profiles(id),
  estimated_value bigint not null default 0,   -- paise
  service_interest text,
  notes text,
  referral_id uuid references public.referrals(id),
  client_id uuid references public.clients(id), -- set on conversion
  lost_reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_leads_stage_idx on public.crm_leads(stage_key);
create index if not exists crm_leads_owner_idx on public.crm_leads(owner_id);
create index if not exists crm_leads_status_idx on public.crm_leads(status);

create table if not exists public.crm_contacts (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  designation text,
  phone text,
  email text,
  whatsapp_number text,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists crm_contacts_client_idx on public.crm_contacts(client_id);

create table if not exists public.crm_activities (
  id uuid primary key default uuid_generate_v4(),
  entity_type text not null check (entity_type in ('lead','client')),
  entity_id uuid not null,
  type text not null check (type in ('call','email','meeting','whatsapp','note','task')),
  subject text,
  body text,
  activity_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists crm_activities_entity_idx on public.crm_activities(entity_type, entity_id);

create table if not exists public.crm_lead_stage_history (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);
create index if not exists crm_lead_stage_history_idx on public.crm_lead_stage_history(lead_id);

-- Additive enrichment on existing tables (nullable — existing rows/behaviour unaffected).
alter table public.clients add column if not exists owner_id uuid references public.profiles(id);
alter table public.clients add column if not exists lifecycle_stage text;   -- lead | active | dormant
alter table public.clients add column if not exists industry text;
alter table public.referrals add column if not exists referral_code text;
alter table public.referrals add column if not exists commission_percent numeric(5,2);

-- Seed CRM permission keys into the Wave-1 registry (additive).
insert into public.permissions (perm_key, module, label) values
  ('crm.lead.view','crm','View leads'),
  ('crm.lead.manage','crm','Create/edit leads'),
  ('crm.lead.convert','crm','Convert lead to client'),
  ('crm.client.view','crm','View clients (CRM)'),
  ('crm.client.manage','crm','Edit clients (CRM)'),
  ('crm.contact.manage','crm','Manage client contacts'),
  ('crm.activity.log','crm','Log activities'),
  ('crm.referral.manage','crm','Manage referral partners')
on conflict (perm_key) do nothing;
insert into public.role_permissions (role_key, perm_key, scope)
select r.role_key, p.perm_key, 'all' from (values ('super_admin'),('director')) r(role_key)
cross join public.permissions p where p.module='crm' on conflict do nothing;
insert into public.role_permissions (role_key, perm_key, scope)
select 'manager', perm_key, 'all' from public.permissions where module='crm' on conflict do nothing;
insert into public.role_permissions (role_key, perm_key, scope) values
  ('executive','crm.lead.view','own'),('executive','crm.lead.manage','own'),
  ('executive','crm.client.view','all'),('executive','crm.contact.manage','all'),('executive','crm.activity.log','all')
on conflict do nothing;

-- RLS (existing auth_role() pattern for consistency + backward-compat).
alter table public.crm_pipeline_stages enable row level security;
alter table public.crm_leads enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_activities enable row level security;
alter table public.crm_lead_stage_history enable row level security;

drop policy if exists crm_stages_read on public.crm_pipeline_stages;
create policy crm_stages_read on public.crm_pipeline_stages for select to public using (auth.uid() is not null);
drop policy if exists crm_stages_write on public.crm_pipeline_stages;
create policy crm_stages_write on public.crm_pipeline_stages for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role]));

-- Leads: staff read; sales roles write.
drop policy if exists crm_leads_read on public.crm_leads;
create policy crm_leads_read on public.crm_leads for select to public using (auth.uid() is not null);
drop policy if exists crm_leads_write on public.crm_leads;
create policy crm_leads_write on public.crm_leads for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role,'executive'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role,'executive'::user_role]));

drop policy if exists crm_contacts_read on public.crm_contacts;
create policy crm_contacts_read on public.crm_contacts for select to public using (auth.uid() is not null);
drop policy if exists crm_contacts_write on public.crm_contacts;
create policy crm_contacts_write on public.crm_contacts for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role,'executive'::user_role,'accounts'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role,'executive'::user_role,'accounts'::user_role]));

drop policy if exists crm_activities_read on public.crm_activities;
create policy crm_activities_read on public.crm_activities for select to public using (auth.uid() is not null);
drop policy if exists crm_activities_write on public.crm_activities;
create policy crm_activities_write on public.crm_activities for all to public using (auth.uid() is not null) with check (created_by = auth.uid());

drop policy if exists crm_lead_hist_read on public.crm_lead_stage_history;
create policy crm_lead_hist_read on public.crm_lead_stage_history for select to public using (auth.uid() is not null);
drop policy if exists crm_lead_hist_write on public.crm_lead_stage_history;
create policy crm_lead_hist_write on public.crm_lead_stage_history for insert to public with check (auth.uid() is not null);
