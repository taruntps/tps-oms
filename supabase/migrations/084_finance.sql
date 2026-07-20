-- Migration 084_finance (Wave 2). Applied to staging; additive/expand-contract.
-- Migration 084 — Finance & Accounts (Wave 2, EXPAND). Additive over existing payments.
-- Money = bigint paise. Billing framework tables support the swappable provider adapter.

-- ── Invoices ──
create table if not exists public.finance_invoices (
  id uuid primary key default uuid_generate_v4(),
  invoice_no text,
  org_id uuid references public.organizations(id),
  client_id uuid references public.clients(id),
  deal_id uuid references public.sales_deals(id),
  order_id uuid references public.sales_orders(id),
  project_id uuid references public.projects(id),
  status text not null default 'draft' check (status in ('draft','issued','partially_paid','paid','cancelled')),
  invoice_date date not null default current_date,
  due_date date,
  place_of_supply text,
  client_gstin text,
  subtotal bigint not null default 0,
  discount_total bigint not null default 0,
  tax_total bigint not null default 0,
  grand_total bigint not null default 0,
  amount_paid bigint not null default 0,
  notes text,
  irn text, qr_code text, pdf_url text,      -- statutory artifacts from the billing provider
  provider text, provider_id text,           -- provider link (also in billing_provider_links)
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists finance_invoices_client_idx on public.finance_invoices(client_id);
create index if not exists finance_invoices_status_idx on public.finance_invoices(status);

create table if not exists public.finance_invoice_lines (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid not null references public.finance_invoices(id) on delete cascade,
  service_id uuid references public.sales_services(id),
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_price bigint not null default 0,
  discount_percent numeric(5,2) not null default 0,
  gst_rate numeric(5,2) not null default 18.00,
  hsn_sac text,
  cgst bigint not null default 0, sgst bigint not null default 0, igst bigint not null default 0,
  line_total bigint not null default 0
);
create index if not exists finance_invoice_lines_idx on public.finance_invoice_lines(invoice_id);

-- ── Credit notes ──
create table if not exists public.finance_credit_notes (
  id uuid primary key default uuid_generate_v4(),
  credit_note_no text,
  invoice_id uuid references public.finance_invoices(id),
  client_id uuid references public.clients(id),
  status text not null default 'draft' check (status in ('draft','issued','cancelled')),
  reason text,
  amount bigint not null default 0,
  cn_date date not null default current_date,
  provider text, provider_id text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ── Payments: additive link to invoice (existing payments table untouched otherwise) ──
alter table public.payments add column if not exists invoice_id uuid references public.finance_invoices(id);

-- ── Government fees (pass-through; NOT revenue) ──
create table if not exists public.finance_govt_fees (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references public.projects(id),
  license_id uuid references public.licenses(id),
  authority text not null default 'FSSAI',    -- FSSAI | Lab | Other
  amount bigint not null default 0,
  paid_by text not null default 'client' check (paid_by in ('client','tps')),
  status text not null default 'pending' check (status in ('pending','paid','recovered')),
  reference_no text, notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ── Bank accounts + accounting period lock ──
create table if not exists public.finance_bank_accounts (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references public.organizations(id),
  name text not null, account_no text, ifsc text, bank_name text,
  is_active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.finance_accounting_periods (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references public.organizations(id),
  period_start date not null, period_end date not null,
  is_closed boolean not null default false,
  closed_by uuid references public.profiles(id), closed_at timestamptz,
  unique (org_id, period_start, period_end)
);

-- ── Billing provider framework (adapter/sync/webhook — provider-agnostic) ──
create table if not exists public.billing_provider_links (
  id uuid primary key default uuid_generate_v4(),
  erp_entity text not null check (erp_entity in ('customer','invoice','credit_note','payment')),
  erp_id uuid not null,
  provider text not null,
  provider_id text,
  provider_serial text, irn text, qr text, pdf_url text,
  status text not null default 'linked' check (status in ('linked','pending','error')),
  last_synced_at timestamptz,
  unique (erp_entity, erp_id, provider)
);
create table if not exists public.billing_sync_queue (
  id uuid primary key default uuid_generate_v4(),
  op text not null,                           -- upsert_customer | create_invoice | update_invoice | cancel_invoice | create_credit_note | record_payment
  erp_entity text not null, erp_id uuid not null,
  provider text not null default 'getswipe',
  payload_hash text,
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued','processing','done','failed')),
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists billing_sync_queue_due_idx on public.billing_sync_queue(status, next_attempt_at);
create table if not exists public.billing_sync_log (
  id uuid primary key default uuid_generate_v4(),
  queue_id uuid references public.billing_sync_queue(id) on delete set null,
  provider text not null, direction text not null check (direction in ('outbound','inbound')),
  request_summary text, response_summary text, http_status int, error_code text,
  created_at timestamptz not null default now()
);
create table if not exists public.billing_webhook_events (
  id uuid primary key default uuid_generate_v4(),
  provider text not null, event_id text, event_type text,
  signature_ok boolean, raw jsonb, processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

-- Permission keys
insert into public.permissions (perm_key, module, label) values
  ('finance.invoice.view','finance','View invoices'),
  ('finance.invoice.manage','finance','Create/edit invoices'),
  ('finance.invoice.cancel','finance','Cancel invoices'),
  ('finance.creditnote.manage','finance','Manage credit notes'),
  ('finance.payment.view','finance','View payments'),
  ('finance.payment.record','finance','Record payments'),
  ('finance.govtfee.manage','finance','Manage government fees'),
  ('finance.report.view','finance','View financial reports'),
  ('finance.report.export','finance','Export financial data'),
  ('finance.billing.sync','finance','Manage billing provider sync'),
  ('finance.setting.manage','finance','Manage finance settings'),
  ('finance.period.close','finance','Close accounting periods')
on conflict (perm_key) do nothing;
insert into public.role_permissions (role_key, perm_key, scope)
select r.role_key, p.perm_key, 'all' from (values ('super_admin'),('director')) r(role_key)
cross join public.permissions p where p.module='finance' on conflict do nothing;
insert into public.role_permissions (role_key, perm_key, scope) values
  ('accounts','finance.invoice.view','all'),('accounts','finance.invoice.manage','all'),
  ('accounts','finance.payment.view','all'),('accounts','finance.payment.record','all'),
  ('accounts','finance.govtfee.manage','all'),('accounts','finance.report.view','all'),
  ('accounts','finance.creditnote.manage','all'),('accounts','finance.billing.sync','all'),
  ('manager','finance.invoice.view','all'),('manager','finance.report.view','all'),
  ('auditor','finance.invoice.view','all'),('auditor','finance.payment.view','all'),('auditor','finance.report.view','all')
on conflict do nothing;

-- RLS: finance staff (accounts/director/super_admin) manage; managers/auditor read.
do $$ declare t text; begin
  foreach t in array array['finance_invoices','finance_invoice_lines','finance_credit_notes','finance_govt_fees','finance_bank_accounts','finance_accounting_periods','billing_provider_links','billing_sync_queue','billing_sync_log','billing_webhook_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format($p$create policy %I on public.%I for select to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'manager'::user_role,'accounts'::user_role,'auditor'::user_role,'executive'::user_role]))$p$, t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($p$create policy %I on public.%I for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'accounts'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'accounts'::user_role]))$p$, t||'_write', t);
  end loop;
end $$;
