-- 122 — WhatsApp marketing campaigns (send approved templates via the org's own Meta
-- Cloud API; no third-party platform fees). Sender = edge fn wa-campaign-worker, drained
-- by cron. Admin-managed; worker uses the service role.
create table if not exists public.wa_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_name text not null,
  language_code text not null default 'en',
  header_image_url text,
  body_params jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','sending','paused','sent')),
  total int not null default 0,
  sent int not null default 0,
  failed int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.wa_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.wa_campaigns(id) on delete cascade,
  phone text not null,
  name text,
  params jsonb,
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  error text,
  message_id text,
  sent_at timestamptz
);
create index if not exists wa_recipients_campaign_status_idx
  on public.wa_campaign_recipients (campaign_id, status);

create table if not exists public.wa_opt_outs (
  phone text primary key,
  reason text,
  opted_out_at timestamptz not null default now()
);

alter table public.wa_campaigns enable row level security;
alter table public.wa_campaign_recipients enable row level security;
alter table public.wa_opt_outs enable row level security;

create policy wa_campaigns_all on public.wa_campaigns for all
  using (coalesce(auth_role() = any (array['super_admin','director','hr']::user_role[]), false))
  with check (coalesce(auth_role() = any (array['super_admin','director','hr']::user_role[]), false));
create policy wa_recipients_all on public.wa_campaign_recipients for all
  using (coalesce(auth_role() = any (array['super_admin','director','hr']::user_role[]), false))
  with check (coalesce(auth_role() = any (array['super_admin','director','hr']::user_role[]), false));
create policy wa_optouts_all on public.wa_opt_outs for all
  using (coalesce(auth_role() = any (array['super_admin','director','hr']::user_role[]), false))
  with check (coalesce(auth_role() = any (array['super_admin','director','hr']::user_role[]), false));

-- Throttled drain of active campaigns (every 3 min, 20/run in the worker). Also run
-- live via cron.schedule during deploy; kept here for reproducibility.
select cron.schedule(
  'wa-campaign-drain',
  '*/3 * * * *',
  $cron$ select net.http_post(
    url := 'https://gytscakgtsbxgdkbqhbx.supabase.co/functions/v1/wa-campaign-worker',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb
  ); $cron$
);
