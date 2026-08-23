-- 124 — WhatsApp Inbox. Meta blocks wa.me links in template buttons, and a Cloud API number
-- has no phone inbox, so campaign replies are otherwise invisible. This stores every inbound
-- reply (via the whatsapp-inbound webhook) and every reply we send back (via wa-send-reply),
-- surfaced on a portal page. Admin-only, same roles as campaigns.

create table if not exists public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('in', 'out')),
  wa_phone text not null,                    -- the customer's number (digits only, no +)
  contact_name text,                         -- WhatsApp profile name (inbound only)
  body text,
  msg_type text not null default 'text',
  wa_message_id text,                        -- Meta message id (dedup + delivery-status matching)
  status text not null default 'received',   -- in: received; out: sent/delivered/read/failed
  error text,
  read_at timestamptz,                       -- inbound: when an admin opened the thread
  created_at timestamptz not null default now()
);
create index if not exists wa_messages_phone_time_idx on public.wa_messages (wa_phone, created_at);
create index if not exists wa_messages_unread_idx on public.wa_messages (read_at) where direction = 'in';
create unique index if not exists wa_messages_waid_uidx on public.wa_messages (wa_message_id) where wa_message_id is not null;

alter table public.wa_messages enable row level security;
create policy wa_messages_all on public.wa_messages for all
  using (coalesce(auth_role() = any (array['super_admin','director','hr']::user_role[]), false))
  with check (coalesce(auth_role() = any (array['super_admin','director','hr']::user_role[]), false));

-- One row per customer number: last message + unread count. security_invoker so the
-- querying admin's RLS on wa_messages applies.
create or replace view public.wa_conversations
with (security_invoker = true) as
select
  m.wa_phone,
  (array_agg(m.contact_name order by m.created_at desc) filter (where m.contact_name is not null))[1] as contact_name,
  max(m.created_at)                                             as last_at,
  (array_agg(m.body order by m.created_at desc))[1]            as last_body,
  (array_agg(m.direction order by m.created_at desc))[1]       as last_direction,
  count(*) filter (where m.direction = 'in' and m.read_at is null) as unread,
  max(m.created_at) filter (where m.direction = 'in')          as last_inbound_at
from public.wa_messages m
group by m.wa_phone;

grant select on public.wa_conversations to authenticated;

-- Verify token for the whatsapp-inbound webhook (used once in Meta's webhook config).
-- Random; created only if absent so re-running is safe.
insert into public.app_settings (key, value, description, is_secret)
select 'whatsapp_webhook_verify_token',
       md5(random()::text || clock_timestamp()::text),
       'Verify token for the whatsapp-inbound webhook (Meta)',
       true
where not exists (select 1 from public.app_settings where key = 'whatsapp_webhook_verify_token');
