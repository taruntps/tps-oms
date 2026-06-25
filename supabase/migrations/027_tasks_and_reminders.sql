-- Migration 027: Single-task module + reminder infrastructure.
--
-- Adds:
--   • tasks               — standalone tasks, optionally linked to a project/client.
--                           Anyone can assign to anyone (per product decision).
--   • notification_log    — dedupe ledger so a reminder is sent at most once per
--                           (kind, ref, recipient, channel, day). Used by both the
--                           daily digest and the urgent per-event emails (Step 3).
--   • reminder_settings   — singleton holding the WhatsApp toggle + digest hour.
--                           WhatsApp stays OFF; no send code until AiSensy is live.
--
-- Reminder Edge Functions + pg_cron schedules are added later (Step 3).

-- ─────────────────────────────────────────────────────────────────────────────
-- tasks
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists tasks (
  id           uuid primary key default uuid_generate_v4(),
  title        text not null,
  description  text,
  assigned_to  uuid not null references profiles(id) on delete cascade,
  assigned_by  uuid          references profiles(id) on delete set null,
  project_id   uuid          references projects(id) on delete set null,
  client_id    uuid          references clients(id)  on delete set null,
  priority     text not null default 'normal' check (priority in ('low','normal','high')),
  status       text not null default 'open'   check (status in ('open','in_progress','done','cancelled')),
  due_date     date,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists tasks_assigned_to_idx on tasks(assigned_to);
create index if not exists tasks_assigned_by_idx on tasks(assigned_by);
create index if not exists tasks_status_idx      on tasks(status);
create index if not exists tasks_due_date_idx     on tasks(due_date);
create index if not exists tasks_project_idx       on tasks(project_id);
create index if not exists tasks_client_idx        on tasks(client_id);

drop trigger if exists tasks_set_updated_at on tasks;
create trigger tasks_set_updated_at before update on tasks
  for each row execute procedure moddatetime(updated_at);

-- Auto-stamp completed_at when a task moves to/from done.
create or replace function tasks_stamp_completed()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and (old.status is distinct from 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists tasks_completed_trg on tasks;
create trigger tasks_completed_trg before update on tasks
  for each row execute procedure tasks_stamp_completed();

alter table tasks enable row level security;

-- View: assignee, assigner, or a manager/admin.
drop policy if exists tasks_select on tasks;
create policy tasks_select on tasks for select to authenticated
using (
  assigned_to = auth.uid()
  or assigned_by = auth.uid()
  or has_role('super_admin','director','manager')
);

-- Create: any logged-in user, but they must be the assigner.
drop policy if exists tasks_insert on tasks;
create policy tasks_insert on tasks for insert to authenticated
with check (assigned_by = auth.uid());

-- Update: assignee (e.g. flip status), assigner, or manager/admin.
drop policy if exists tasks_update on tasks;
create policy tasks_update on tasks for update to authenticated
using (
  assigned_to = auth.uid() or assigned_by = auth.uid()
  or has_role('super_admin','director','manager')
)
with check (
  assigned_to = auth.uid() or assigned_by = auth.uid()
  or has_role('super_admin','director','manager')
);

-- Delete: the assigner or an admin.
drop policy if exists tasks_delete on tasks;
create policy tasks_delete on tasks for delete to authenticated
using (assigned_by = auth.uid() or has_role('super_admin','director'));

-- ─────────────────────────────────────────────────────────────────────────────
-- notification_log (written by Edge Functions via service role)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists notification_log (
  id         uuid primary key default uuid_generate_v4(),
  kind       text not null,   -- task_due | licence_expiry | payment_overdue | query_open | digest
  ref_id     uuid,            -- the source row id; null for a digest
  recipient  uuid not null references profiles(id) on delete cascade,
  channel    text not null default 'email' check (channel in ('email','whatsapp')),
  for_date   date not null default ((now() at time zone 'Asia/Kolkata')::date),
  sent_at    timestamptz not null default now(),
  meta       jsonb
);

create unique index if not exists notification_log_dedupe
  on notification_log (kind, coalesce(ref_id, '00000000-0000-0000-0000-000000000000'::uuid), recipient, channel, for_date);

alter table notification_log enable row level security;
-- Admins may inspect the log; Edge Functions use the service role and bypass RLS.
drop policy if exists notification_log_select on notification_log;
create policy notification_log_select on notification_log for select to authenticated
using (has_role('super_admin','director'));

-- ─────────────────────────────────────────────────────────────────────────────
-- reminder_settings (singleton)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists reminder_settings (
  id               boolean primary key default true check (id),
  email_enabled    boolean not null default true,
  whatsapp_enabled boolean not null default false,
  digest_hour_ist  int     not null default 9 check (digest_hour_ist between 0 and 23),
  updated_at       timestamptz not null default now()
);
insert into reminder_settings (id) values (true) on conflict (id) do nothing;

drop trigger if exists reminder_settings_set_updated_at on reminder_settings;
create trigger reminder_settings_set_updated_at before update on reminder_settings
  for each row execute procedure moddatetime(updated_at);

alter table reminder_settings enable row level security;
-- Everyone can read the toggle (UI needs it); only admins change it.
drop policy if exists reminder_settings_select on reminder_settings;
create policy reminder_settings_select on reminder_settings for select to authenticated
using (true);
drop policy if exists reminder_settings_update on reminder_settings;
create policy reminder_settings_update on reminder_settings for update to authenticated
using (has_role('super_admin','director'))
with check (has_role('super_admin','director'));
