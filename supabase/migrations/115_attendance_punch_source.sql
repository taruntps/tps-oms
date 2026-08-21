-- 115 — Attendance capture source toggle: 'portal' (in-app GPS + selfie) or
-- 'device' (Hikvision face terminal). When 'device', in-portal punch UI hidden.
-- Applied live via apply_migration.
alter table public.attendance_settings
  add column if not exists punch_source text not null default 'portal'
  check (punch_source in ('portal', 'device'));
