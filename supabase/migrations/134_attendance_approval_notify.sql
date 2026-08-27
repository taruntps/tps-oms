-- 134 — Notify approvers when an attendance approval request is raised.
-- Previously submitting a regularization / OD-WFH / overtime request only inserted the
-- row — no bell, email, or WhatsApp reached the approver. This trigger creates a
-- notification row (type 'attendance_approval', added to the enum) for every active
-- approver (super_admin / director / manager / hr) except the submitter. The bell shows
-- it immediately; notify-dispatch fans it out to WhatsApp + email.

-- New notification enum value (applied out-of-band first, before the trigger uses it).
alter type public.notification_type add value if not exists 'attendance_approval';

create or replace function public.notify_attendance_approval()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  emp_name  text;
  title_txt text := 'Attendance approval needed';
  body_txt  text;
  appr      record;
begin
  if NEW.status is distinct from 'pending' then return NEW; end if;
  select coalesce(name, 'An employee') into emp_name from public.profiles where id = NEW.employee_id;

  if TG_TABLE_NAME = 'hr_attendance_regularizations' then
    body_txt := emp_name || ' — Regularization (' || replace(NEW.kind, '_', ' ') || ') for '
      || to_char(NEW.work_date, 'DD Mon YYYY')
      || coalesce(' · In '  || to_char(NEW.requested_in  at time zone 'Asia/Kolkata', 'HH12:MI AM'), '')
      || coalesce(' · Out ' || to_char(NEW.requested_out at time zone 'Asia/Kolkata', 'HH12:MI AM'), '');
  elsif TG_TABLE_NAME = 'hr_outdoor_duty' then
    body_txt := emp_name || ' — ' || upper(NEW.mode) || ' from ' || to_char(NEW.from_date, 'DD Mon YYYY')
      || case when NEW.to_date <> NEW.from_date then ' to ' || to_char(NEW.to_date, 'DD Mon YYYY') else '' end
      || coalesce(' · ' || NEW.location, '');
  else
    body_txt := emp_name || ' — Overtime ' || NEW.minutes || ' min on ' || to_char(NEW.work_date, 'DD Mon YYYY');
  end if;

  for appr in
    select id from public.profiles
    where is_active = true
      and role in ('super_admin','director','manager','hr')
      and id <> NEW.employee_id
  loop
    insert into public.notifications (user_id, type, title, body, reference_id, reference_type, meta, is_read)
    values (appr.id, 'attendance_approval', title_txt, body_txt, NEW.id, TG_TABLE_NAME, '{}'::jsonb, false);
  end loop;
  return NEW;
end $$;

drop trigger if exists trg_notify_reg_approval on public.hr_attendance_regularizations;
create trigger trg_notify_reg_approval after insert on public.hr_attendance_regularizations
  for each row execute function public.notify_attendance_approval();

drop trigger if exists trg_notify_od_approval on public.hr_outdoor_duty;
create trigger trg_notify_od_approval after insert on public.hr_outdoor_duty
  for each row execute function public.notify_attendance_approval();

drop trigger if exists trg_notify_ot_approval on public.hr_overtime;
create trigger trg_notify_ot_approval after insert on public.hr_overtime
  for each row execute function public.notify_attendance_approval();
