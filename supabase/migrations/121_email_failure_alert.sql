-- 121 — Email-failure admin alert.
-- Raises an in-app notification to admins (super_admin/director/hr) when a portal
-- email send fails (e.g. ZeptoMail "Credit exhausted" / HTTP 429). Email is down at
-- that point and SMS notifications need DLT templates, so the alert is in-app only.
-- Deduped to once per 24h. Called by the email-health cron (and can be called by any
-- email sender's failure branch). ZeptoMail has no balance API, so this is
-- failure-triggered rather than a proactive low-credit threshold.
create or replace function public.raise_email_failure_alert(p_detail text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare a record;
begin
  if exists (
    select 1 from public.notifications
    where reference_type = 'email_failure' and created_at > now() - interval '24 hours'
  ) then
    return;
  end if;

  for a in
    select id from public.profiles
    where role = any (array['super_admin','director','hr']::user_role[])
      and coalesce(is_active, true)
  loop
    insert into public.notifications (user_id, type, title, body, reference_type, meta)
    values (
      a.id,
      'expiry_warning',
      '⚠️ Portal emails are failing',
      'Emails could not be sent'
        || case when p_detail is not null and length(p_detail) > 0 then ' (' || p_detail || ')' else '' end
        || '. Most likely ZeptoMail credits are exhausted — top up in ZeptoMail. SMS/OTP still work.',
      'email_failure',
      jsonb_build_object('detail', p_detail)
    );
  end loop;
end $$;

grant execute on function public.raise_email_failure_alert(text) to authenticated, service_role;

-- Daily synthetic email deliverability check (edge fn email-health) at 04:00 UTC (09:30 IST).
-- Also run live via cron.schedule during deploy; kept here for reproducibility.
select cron.schedule(
  'email-health-check',
  '0 4 * * *',
  $cron$ select net.http_post(
    url := 'https://gytscakgtsbxgdkbqhbx.supabase.co/functions/v1/email-health',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb
  ); $cron$
);
