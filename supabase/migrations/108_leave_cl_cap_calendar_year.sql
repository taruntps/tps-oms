-- 108 — CL max 2 consecutive days + leave year = calendar (Jan–Dec).
-- daySpan counts calendar days inclusive, so a Fri–Mon leave is already 4 days
-- (sandwich rule); this just blocks CL spans over 2 days. Applied live via
-- apply_migration; repo record.

create or replace function public.enforce_leave_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  select code into v_code from public.hr_leave_types where id = new.leave_type_id;
  if v_code = 'CL' and coalesce(new.is_half_day, false) = false
     and (new.to_date - new.from_date + 1) > 2 then
    raise exception 'Casual Leave cannot exceed 2 consecutive days (weekends in between count too). Use Earned Leave for longer spells.';
  end if;
  return new;
end $$;

drop trigger if exists trg_enforce_leave_rules on public.hr_leave_requests;
create trigger trg_enforce_leave_rules
  before insert on public.hr_leave_requests
  for each row execute function public.enforce_leave_rules();

update public.hr_policy_settings set value = '"calendar_year"'::jsonb where key = 'leave.year_basis';
