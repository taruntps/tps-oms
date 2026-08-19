-- 106 — Attendance rule config + on-the-fly daily evaluation.
-- Adds rule thresholds to the attendance_settings singleton and evaluate_attendance(),
-- a set-returning function computing each day's status/units per the confirmed rules:
--   In 09:00 / Out 18:00 · <4.5h worked = half · late >09:10 grace (1/mo) then half,
--   >09:30 half · early mirror · approved short leave excuses late/early · approved
--   paid leave adjusts (no LOP) · missing punch-out ⇒ skip hours/early rules ·
--   future dates and today (no punch) = 'none', past no-punch = absent.
-- Applied live via apply_migration; this file is the repo record. See the live
-- definition of evaluate_attendance(uuid,date,date) for the authoritative body.

alter table public.attendance_settings
  add column if not exists expected_end_time time default '18:00:00',
  add column if not exists grace_late_min int default 10,
  add column if not exists late_half_after time default '09:30:00',
  add column if not exists grace_early_min int default 10,
  add column if not exists early_half_before time default '17:30:00',
  add column if not exists half_day_hours numeric default 4.5,
  add column if not exists monthly_grace_count int default 1;

update public.attendance_settings
  set expected_start_time = coalesce(expected_start_time, '09:00:00'),
      standard_hours = coalesce(standard_hours, 9);

-- evaluate_attendance(p_employee uuid, p_from date, p_to date) returns table(
--   work_date, status, first_in, last_out, worked_minutes, late_minutes,
--   early_minutes, penalty, worked_units, lop_units, covered) — see live DB.
