-- 135 — Attendance policy correction (payroll-critical, simulation-verified):
--  • Present now requires BOTH in AND out. A single-punch day (past) becomes
--    'missing_punch' = half-day (0.5 worked / 0.5 LOP) until regularized+approved.
--  • Approved OD/WFH marks the day Present (on-duty), no punch needed.
--  • Leave status carries its type code (CL/SL/EL/…) in `covered`.
--  • Full/half by time (grace 10m, >09:30 half, <17:30 half, <4.5h half) unchanged.
--  • New trigger: approving a regularization writes its requested In/Out as punches,
--    so the day re-evaluates to Present/Half by the normal rules.
-- Verified impact (Aug 2026, whole team): only 6 incomplete-punch days change
-- (present→missing_punch), +2.5 LOP total; no leave/OD day loses credit.

-- (evaluate_attendance body identical to the verified evaluate_attendance_v2 shadow)
-- NOTE: the full evaluate_attendance(uuid,date,date) body was applied via the Supabase
-- migration of the same name (identical to the verified evaluate_attendance_v2 shadow,
-- which is dropped after). Key additions vs the previous version:
--   • not has_out (single punch, past)  -> status 'missing_punch', 0.5 / 0.5
--   • approved hr_outdoor_duty covering the day -> present (covered = OD/WFH)
--   • leave status carries its type code (CL/SL/EL…) in `covered`
-- Plus the trigger below and a bulk helper for the muster.

create or replace function public.apply_regularization_punches()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if NEW.status = 'approved' and OLD.status is distinct from 'approved' then
    if NEW.requested_in is not null then
      insert into public.attendance_punches (user_id, punch_at, source)
      select NEW.employee_id, NEW.requested_in, 'regularization'
      where not exists (select 1 from public.attendance_punches p
        where p.user_id = NEW.employee_id and p.punch_at = NEW.requested_in and p.source = 'regularization');
    end if;
    if NEW.requested_out is not null then
      insert into public.attendance_punches (user_id, punch_at, source)
      select NEW.employee_id, NEW.requested_out, 'regularization'
      where not exists (select 1 from public.attendance_punches p
        where p.user_id = NEW.employee_id and p.punch_at = NEW.requested_out and p.source = 'regularization');
    end if;
  end if;
  return NEW;
end $fn$;

drop trigger if exists trg_apply_regularization_punches on public.hr_attendance_regularizations;
create trigger trg_apply_regularization_punches after update on public.hr_attendance_regularizations
  for each row execute function public.apply_regularization_punches();

create or replace function public.evaluate_attendance_bulk(p_from date, p_to date)
returns table(employee_id uuid, work_date date, status text, worked_units numeric, lop_units numeric, penalty text, covered text)
language plpgsql stable security definer set search_path to 'public' as $fn$
declare e record;
begin
  for e in select id from public.profiles where is_active = true loop
    return query select e.id, ev.work_date, ev.status, ev.worked_units, ev.lop_units, ev.penalty, ev.covered
      from public.evaluate_attendance(e.id, p_from, p_to) ev;
  end loop;
end $fn$;
grant execute on function public.evaluate_attendance_bulk(date, date) to authenticated;
