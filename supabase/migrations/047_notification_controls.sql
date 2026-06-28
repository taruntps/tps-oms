-- 047_notification_controls.sql
-- Adds granular notification type controls to reminder_settings
-- and per-user notification preferences to profiles.

-- 1. Per-user notification preferences on profiles
alter table profiles
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

comment on column profiles.notification_prefs is
  'Admin-set notification prefs. Empty = follow global settings. '
  '{"types":["stage_overdue","payment_overdue"]} = only those types.';

-- 2. Add per-type control columns to reminder_settings singleton
alter table reminder_settings
  add column if not exists instant_types jsonb not null default
    '["stage_overdue","payment_overdue","license_expiring","expiry_warning","block_request","block_approved","project_assigned","query_received"]'::jsonb,
  add column if not exists email_types jsonb not null default
    '["stage_overdue","payment_overdue","license_expiring","expiry_warning","project_assigned"]'::jsonb,
  add column if not exists digest_hour_ist int not null default 9
    check (digest_hour_ist between 0 and 23);

comment on column reminder_settings.instant_types is
  'Notification types that trigger in-app instant notifications (array of type strings).';
comment on column reminder_settings.email_types is
  'Notification types included in email digest / instant email alerts.';
