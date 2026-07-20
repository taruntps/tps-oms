-- Migration 086 — snapshot customer master fields on the invoice (EXPAND, additive).
-- Applied to staging. Defaults are auto-filled from the clients master in the invoice
-- form; each is overridable per-invoice. client_gstin + place_of_supply already exist (084).
alter table public.finance_invoices add column if not exists billing_address text;
alter table public.finance_invoices add column if not exists shipping_address text;
alter table public.finance_invoices add column if not exists contact_person text;
alter table public.finance_invoices add column if not exists contact_email text;
alter table public.finance_invoices add column if not exists contact_phone text;
