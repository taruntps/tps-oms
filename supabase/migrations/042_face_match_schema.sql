-- 042 — Face-match attendance: enrolment template + settings + per-punch audit.

-- One active face template per employee. Descriptor is a one-way numeric embedding,
-- not a reversible image.
alter table public.profiles
  add column if not exists face_descriptor  jsonb,
  add column if not exists face_enrolled_at timestamptz,
  add column if not exists face_model       text;

-- Admin controls. Ships OFF (dark launch). Threshold = minimum similarity (0..1).
alter table public.attendance_settings
  add column if not exists face_match_required  boolean not null default false,
  add column if not exists face_match_threshold numeric not null default 0.5;

-- Per-punch audit of the verification result.
alter table public.attendance_punches
  add column if not exists face_matched boolean,
  add column if not exists face_score   numeric;
