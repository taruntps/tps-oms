-- Migration 019: Attendance core — offices, settings, punches, geofence RPC, bucket
--
-- Server-side enforcement: the punch_attendance() RPC (SECURITY DEFINER) decides the
-- geofence, accuracy gate and timestamp — the client cannot bypass it. Punches are
-- an immutable audit trail (no UPDATE/DELETE policies).

-- ── Office locations (geofence anchors) ──────────────────────────────────────
create table if not exists office_locations (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  latitude   double precision not null,
  longitude  double precision not null,
  radius_m   integer not null default 150,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
alter table office_locations enable row level security;
drop policy if exists "office_locations_select" on office_locations;
create policy "office_locations_select" on office_locations for select using (auth.uid() is not null);
drop policy if exists "office_locations_write" on office_locations;
create policy "office_locations_write" on office_locations for all
  using (has_role('super_admin','director')) with check (has_role('super_admin','director'));

-- ── Attendance settings (single row) ─────────────────────────────────────────
create table if not exists attendance_settings (
  id                  boolean primary key default true,   -- single-row guard
  expected_start_time time not null default '09:30',
  standard_hours      numeric not null default 8,
  selfie_required     boolean not null default false,
  accuracy_threshold_m integer not null default 100,
  updated_at          timestamptz not null default now(),
  constraint attendance_settings_singleton check (id)
);
alter table attendance_settings enable row level security;
drop policy if exists "attendance_settings_select" on attendance_settings;
create policy "attendance_settings_select" on attendance_settings for select using (auth.uid() is not null);
drop policy if exists "attendance_settings_write" on attendance_settings;
create policy "attendance_settings_write" on attendance_settings for all
  using (has_role('super_admin','director')) with check (has_role('super_admin','director'));

-- ── Attendance punches (immutable) ───────────────────────────────────────────
create table if not exists attendance_punches (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references profiles(id) on delete cascade,
  punch_at     timestamptz not null default now(),
  latitude     double precision,
  longitude    double precision,
  accuracy_m   double precision,
  distance_m   double precision,
  office_id    uuid references office_locations(id),
  within_fence boolean not null default false,
  is_field     boolean not null default false,
  selfie_path  text,
  device_info  text,
  created_at   timestamptz not null default now()
);
create index if not exists attendance_punches_user_time_idx on attendance_punches(user_id, punch_at);
alter table attendance_punches enable row level security;
-- View own; managers/HR/admin view all. Inserts go through the RPC only (SECURITY
-- DEFINER); no update/delete (audit trail).
drop policy if exists "attendance_punches_select" on attendance_punches;
create policy "attendance_punches_select" on attendance_punches for select using (
  user_id = auth.uid() or has_role('super_admin','director','hr','manager')
);

-- ── Daily rollup view (security_invoker → respects punch RLS) ─────────────────
drop view if exists attendance_days;
create view attendance_days with (security_invoker = true) as
select
  user_id,
  (punch_at at time zone 'Asia/Kolkata')::date           as work_date,
  min(punch_at)                                          as first_in,
  max(punch_at)                                          as last_out,
  count(*)                                               as punch_count,
  round(extract(epoch from (max(punch_at) - min(punch_at))) / 60.0) as worked_minutes
from attendance_punches
group by user_id, (punch_at at time zone 'Asia/Kolkata')::date;

-- ── Punch RPC (server-side geofence + accuracy + timestamp) ──────────────────
create or replace function punch_attendance(
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision,
  p_selfie_path text default null,
  p_device text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_settings attendance_settings%rowtype;
  v_is_field boolean;
  v_office office_locations%rowtype;
  v_dist double precision;
  v_best_dist double precision := null;
  v_best_office uuid := null;
  v_within boolean := false;
  v_punch_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select * into v_settings from attendance_settings limit 1;
  select is_field_staff into v_is_field from profiles where id = v_user;

  if p_accuracy is null or p_accuracy > coalesce(v_settings.accuracy_threshold_m, 100) then
    raise exception 'Location accuracy too low (% m). Move to an open area and retry.', round(coalesce(p_accuracy, 9999));
  end if;

  for v_office in select * from office_locations where is_active loop
    v_dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p_lat - v_office.latitude) / 2), 2) +
      cos(radians(v_office.latitude)) * cos(radians(p_lat)) *
      power(sin(radians(p_lng - v_office.longitude) / 2), 2)
    ));
    if v_best_dist is null or v_dist < v_best_dist then
      v_best_dist := v_dist; v_best_office := v_office.id; v_within := v_dist <= v_office.radius_m;
    end if;
  end loop;

  if coalesce(v_settings.selfie_required, false) and p_selfie_path is null then
    raise exception 'A selfie is required to punch.';
  end if;

  if not coalesce(v_is_field, false) and not coalesce(v_within, false) then
    raise exception 'You are not at an office location (nearest is % m away).', round(coalesce(v_best_dist, 0));
  end if;

  insert into attendance_punches
    (user_id, punch_at, latitude, longitude, accuracy_m, distance_m, office_id, within_fence, is_field, selfie_path, device_info)
  values
    (v_user, now(), p_lat, p_lng, p_accuracy, v_best_dist, v_best_office, coalesce(v_within,false), coalesce(v_is_field,false), p_selfie_path, p_device)
  returning id into v_punch_id;

  return jsonb_build_object(
    'id', v_punch_id,
    'within_fence', coalesce(v_within, false),
    'distance_m', round(coalesce(v_best_dist, 0)),
    'is_field', coalesce(v_is_field, false)
  );
end; $$;

-- ── Storage bucket for selfies (private) ─────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('attendance', 'attendance', false, 2097152)  -- 2 MB
on conflict (id) do nothing;

drop policy if exists "attendance_read" on storage.objects;
create policy "attendance_read" on storage.objects for select to authenticated using (
  bucket_id = 'attendance' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or has_role('super_admin','director','hr','manager')
  )
);
drop policy if exists "attendance_write" on storage.objects;
create policy "attendance_write" on storage.objects for insert to authenticated with check (
  bucket_id = 'attendance' and (storage.foldername(name))[1] = auth.uid()::text
);

-- ── Seed: default office + settings (admin edits exact location later) ────────
insert into attendance_settings (id) values (true) on conflict (id) do nothing;
insert into office_locations (name, latitude, longitude, radius_m)
select 'TPS Office — Mohali (CP67, Sector 67)', 30.6726, 76.7395, 200
where not exists (select 1 from office_locations);
