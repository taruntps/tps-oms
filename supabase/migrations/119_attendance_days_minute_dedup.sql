-- 119 — attendance_days: collapse punches to distinct MINUTES (ignore seconds).
-- Multiple scans within the same minute count as ONE punch. In = earliest minute;
-- Out = latest minute only when a different minute exists. A single distinct minute
-- (incl. repeated same-minute scans) => In only, no Out, no worked_minutes (so a
-- same-minute blip never triggers the "worked < 4.5h" half-day). Devices that fire
-- several events per scan are absorbed here. Feeds evaluate_attendance + payroll.
create or replace view public.attendance_days as
with mins as (
  select
    user_id,
    (punch_at at time zone 'Asia/Kolkata')::date as work_date,
    date_trunc('minute', punch_at) as m
  from public.attendance_punches
  group by user_id, ((punch_at at time zone 'Asia/Kolkata')::date), date_trunc('minute', punch_at)
)
select
  user_id,
  work_date,
  min(m) as first_in,
  case when count(*) > 1 then max(m) else null end as last_out,
  count(*)::bigint as punch_count,
  case when count(*) > 1 then round(extract(epoch from (max(m) - min(m))) / 60.0) else null end as worked_minutes
from mins
group by user_id, work_date;
