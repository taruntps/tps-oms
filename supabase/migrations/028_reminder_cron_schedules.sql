-- Migration 028: schedule the reminder Edge Functions via pg_cron + pg_net.
--   • daily-reminders : 03:30 UTC == 09:00 IST  (task digests + licence 30-day digest)
--   • urgent-alerts   : hourly                  (new task → assignee+assigner, licence 7-day)
-- Auth uses the project ANON key (public; safe to inline). Functions are verify_jwt=true.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin perform cron.unschedule('tps-daily-reminders'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('tps-urgent-alerts');   exception when others then null; end $$;

select cron.schedule('tps-daily-reminders', '30 3 * * *', $job$
  select net.http_post(
    url := 'https://muxwwvwmephtwghsrzbp.supabase.co/functions/v1/daily-reminders',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11eHd3dndtZXBodHdnaHNyemJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNDg3OTksImV4cCI6MjA5NzcyNDc5OX0.qE9Rp_-ikJYCW4qPLgUfuujgBK0pDo-fQFAbHTT4bEk'),
    body := '{}'::jsonb
  );
$job$);

select cron.schedule('tps-urgent-alerts', '0 * * * *', $job$
  select net.http_post(
    url := 'https://muxwwvwmephtwghsrzbp.supabase.co/functions/v1/urgent-alerts',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11eHd3dndtZXBodHdnaHNyemJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNDg3OTksImV4cCI6MjA5NzcyNDc5OX0.qE9Rp_-ikJYCW4qPLgUfuujgBK0pDo-fQFAbHTT4bEk'),
    body := '{}'::jsonb
  );
$job$);
