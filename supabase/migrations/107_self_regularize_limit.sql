-- 107 — Miss-punch (regularisation) self-service cap: an employee may raise at most
-- attendance_settings.self_regularize_limit self-regularisations per month (default 2).
-- Admin/HR/manager are exempt (they regularise on behalf of staff). Applied live via
-- apply_migration; this file is the repo record.

alter table public.attendance_settings
  add column if not exists self_regularize_limit int default 2;

create or replace function public.enforce_self_regularization_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_limit int; v_count int;
begin
  if has_role('super_admin','director','hr','manager') then return new; end if;
  select coalesce(self_regularize_limit, 2) into v_limit from public.attendance_settings limit 1;
  select count(*) into v_count from public.hr_attendance_regularizations
    where employee_id = new.employee_id and created_by = new.employee_id
      and status <> 'cancelled'
      and date_trunc('month', work_date) = date_trunc('month', new.work_date);
  if v_count >= v_limit then
    raise exception 'Monthly self miss-punch limit reached (% per month). Please ask admin / HR to regularise this punch.', v_limit;
  end if;
  return new;
end $$;

drop trigger if exists trg_self_regularize_limit on public.hr_attendance_regularizations;
create trigger trg_self_regularize_limit
  before insert on public.hr_attendance_regularizations
  for each row execute function public.enforce_self_regularization_limit();
