-- ============================================================
-- TPS-OMS Migration 005: WhatsApp Integration Schema
-- ============================================================

-- pg_net: HTTP calls from pg_cron to invoke Edge Functions
create extension if not exists pg_net;

-- WhatsApp number on profiles (may differ from business phone)
alter table profiles add column if not exists whatsapp_number text;

-- Track which notifications have been dispatched via WhatsApp
alter table notifications add column if not exists whatsapp_sent_at timestamptz;

-- ============================================================
-- APP SETTINGS — runtime key-value config
-- ============================================================
create table if not exists app_settings (
  key         text primary key,
  value       text,
  description text,
  is_secret   boolean default false,
  updated_at  timestamptz default now(),
  updated_by  uuid references profiles(id)
);

alter table app_settings enable row level security;

create policy "manager_plus_read_settings" on app_settings
  for select using (has_role('super_admin','director','manager'));

create policy "director_plus_write_settings" on app_settings
  for all using (has_role('super_admin','director'))
  with check (has_role('super_admin','director'));

-- Default entries (idempotent)
insert into app_settings(key, value, description, is_secret) values
  ('whatsapp_enabled', 'false',     'Master toggle for WhatsApp notifications',         false),
  ('whatsapp_bsp',     'interakt',  'BSP provider: interakt | wati | aisensy',          false),
  ('whatsapp_api_key', '',          'BSP API key — keep blank until BSP is set up',     true),
  ('whatsapp_wati_url','',          'WATI live server URL (only needed for wati BSP)',   false)
on conflict (key) do nothing;

-- ============================================================
-- WHATSAPP LOG — audit trail for every dispatch
-- ============================================================
create table if not exists whatsapp_log (
  id         uuid primary key default uuid_generate_v4(),
  phone      text not null,
  template   text not null,
  params     text[],
  ref_id     text,
  bsp        text,
  status     text check (status in ('sent','failed','queued')),
  response   jsonb,
  created_at timestamptz default now()
);

alter table whatsapp_log enable row level security;

create policy "admin_view_whatsapp_log" on whatsapp_log
  for select using (has_role('super_admin','director'));

-- ============================================================
-- SCHEDULED EDGE FUNCTION INVOCATIONS via pg_cron + pg_net
--
-- !! ACTION REQUIRED !!
-- After deploying the Edge Functions, run these two statements
-- in the Supabase SQL Editor. Replace both placeholders first:
--   <YOUR_PROJECT_REF>   → e.g. muxwwvwmephtwghsrzbp
--   <YOUR_SERVICE_ROLE_KEY> → from Supabase → Settings → API
-- ============================================================

-- 1) Dispatch WhatsApp alerts — daily 9 AM IST (03:30 UTC)
-- select cron.schedule(
--   'whatsapp-notify-dispatch',
--   '30 3 * * *',
--   $$
--   select net.http_post(
--     url     := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/notify-dispatch',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer <YOUR_SERVICE_ROLE_KEY>"}'::jsonb,
--     body    := '{}'::jsonb
--   )
--   $$
-- );

-- 2) Escalate stale block requests — every 4 hours
-- select cron.schedule(
--   'block-escalation',
--   '0 */4 * * *',
--   $$
--   select net.http_post(
--     url     := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/block-escalate',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer <YOUR_SERVICE_ROLE_KEY>"}'::jsonb,
--     body    := '{}'::jsonb
--   )
--   $$
-- );
