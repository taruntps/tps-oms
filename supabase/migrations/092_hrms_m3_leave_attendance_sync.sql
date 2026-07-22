-- Migration 092 — M3 Leave↔Attendance integration (additive). Applied to staging.
-- Approving a leave request marks the M2 hr_attendance_days rows for the range as on-leave;
-- reverting (cancel/reject of an approved leave) clears them. This POPULATES M2's data table
-- (its intended use) without modifying frozen M2 schema/behavior.
create or replace function public.fn_leave_to_attendance()
returns trigger language plpgsql security definer set search_path = public as $$
declare d date; lt text;
begin
  select code into lt from hr_leave_types where id = new.leave_type_id;
  if new.status = 'approved' and (old.status is distinct from 'approved') then
    d := new.from_date;
    while d <= new.to_date loop
      insert into hr_attendance_days (employee_id, work_date, day_type, status, remarks, evaluated_at)
      values (new.employee_id, d, 'leave',
              case when new.is_half_day then 'half_day' else 'on_leave' end,
              'Leave ('||coalesce(lt,'?')||')', now())
      on conflict (employee_id, work_date) do update
        set day_type = 'leave',
            status = case when excluded.status = 'half_day' then 'half_day' else 'on_leave' end,
            remarks = excluded.remarks, updated_at = now();
      d := d + 1;
    end loop;
  elsif old.status = 'approved' and new.status in ('cancelled','rejected') then
    delete from hr_attendance_days
    where employee_id = new.employee_id and work_date between new.from_date and new.to_date
      and day_type = 'leave';
  end if;
  return new;
end $$;

drop trigger if exists trg_leave_to_attendance on public.hr_leave_requests;
create trigger trg_leave_to_attendance after update on public.hr_leave_requests
  for each row execute function public.fn_leave_to_attendance();
