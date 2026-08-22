-- 120 — Ingest-level dedup for the Hikvision terminal (fires 7-9 events per scan).
-- Clean existing intra-minute device duplicates (keep the earliest of each user+minute),
-- then enforce one device punch per employee per minute atomically. Partial index on
-- source='device' leaves app/manual punches untouched; UTC-truncation keeps the
-- expression IMMUTABLE (indexable). The hik-events edge function (v4) pre-checks the
-- minute and catches this 23505 on a concurrent burst.
delete from public.attendance_punches a
using (
  select id,
         row_number() over (
           partition by user_id, date_trunc('minute', (punch_at at time zone 'UTC'))
           order by punch_at
         ) as rn
  from public.attendance_punches
  where source = 'device'
) r
where a.id = r.id and r.rn > 1;

create unique index if not exists uq_device_punch_minute
  on public.attendance_punches (user_id, (date_trunc('minute', (punch_at at time zone 'UTC'))))
  where source = 'device';
