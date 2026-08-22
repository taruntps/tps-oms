-- 118 — Calendar exceptions: company-wide day-type switch (Working / Holiday / Off).
-- Lets admins turn any date into a working day (e.g. a Sunday), a holiday, or an off day.
-- Consulted by evaluate_attendance AND payroll's working-days basis so attendance and
-- salary stay in sync.

create table if not exists public.hr_day_overrides (
  id uuid primary key default gen_random_uuid(),
  work_date date not null unique,
  day_type text not null check (day_type in ('working','holiday','off')),
  label text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.hr_day_overrides enable row level security;

create policy hr_day_overrides_read on public.hr_day_overrides
  for select using (auth.uid() is not null);
create policy hr_day_overrides_write on public.hr_day_overrides
  for all
  using (coalesce(auth_role() = any (array['super_admin','director','hr']::user_role[]), false))
  with check (coalesce(auth_role() = any (array['super_admin','director','hr']::user_role[]), false));

-- evaluate_attendance now consults the override FIRST (after per-employee manual status):
-- 'holiday' -> holiday, 'off' -> weekly_off, 'working' -> evaluate from punches (skips the
-- standing holiday list AND the Sat/Sun weekend rule for that date).
create or replace function public.evaluate_attendance(p_employee uuid, p_from date, p_to date)
 returns table(work_date date, status text, first_in timestamp with time zone, last_out timestamp with time zone, worked_minutes numeric, late_minutes integer, early_minutes integer, penalty text, worked_units numeric, lop_units numeric, covered text)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  cfg record; d date; dow int; v_today date := (now() at time zone 'Asia/Kolkata')::date;
  g_start time; g_end time; g_grace int; g_late_half time; e_grace int; e_half_before time;
  half_hours numeric; grace_cnt int;
  late_used int := 0; early_used int := 0;
  rec record; ov_status text; v_ovr text;
  arr time; dep time; has_out boolean; wmin numeric;
  is_holiday boolean; leave_full boolean; leave_half boolean; sl_hours numeric;
  cat text; pen text; wu numeric; lop numeric; cov text;
begin
  select * into cfg from public.attendance_settings limit 1;
  g_start := coalesce(cfg.expected_start_time, '09:00'); g_end := coalesce(cfg.expected_end_time, '18:00');
  g_grace := coalesce(cfg.grace_late_min, 10); g_late_half := coalesce(cfg.late_half_after, '09:30');
  e_grace := coalesce(cfg.grace_early_min, 10); e_half_before := coalesce(cfg.early_half_before, '17:30');
  half_hours := coalesce(cfg.half_day_hours, 4.5); grace_cnt := coalesce(cfg.monthly_grace_count, 1);

  d := p_from;
  while d <= p_to loop
    dow := extract(dow from d);
    if extract(day from d) = 1 then late_used := 0; early_used := 0; end if;

    select hd.status into ov_status from public.hr_attendance_days hd
      where hd.employee_id = p_employee and hd.work_date = d limit 1;
    select o.day_type into v_ovr from public.hr_day_overrides o
      where o.work_date = d and o.is_active limit 1;
    select min(a.first_in) as fi, max(a.last_out) as lo, max(a.worked_minutes) as wm into rec
      from public.attendance_days a where a.user_id = p_employee and a.work_date = d;

    is_holiday := exists(select 1 from public.hr_holidays h where h.holiday_date = d and h.is_active);
    leave_full := exists(select 1 from public.hr_leave_requests l where l.employee_id = p_employee
        and l.status = 'approved' and d between l.from_date and l.to_date and coalesce(l.is_half_day,false) = false);
    leave_half := exists(select 1 from public.hr_leave_requests l where l.employee_id = p_employee
        and l.status = 'approved' and d between l.from_date and l.to_date and coalesce(l.is_half_day,false) = true);
    select coalesce(sum(hours),0) into sl_hours from public.hr_short_leaves s
      where s.employee_id = p_employee and s.leave_date = d and s.status = 'approved';

    first_in := rec.fi; last_out := rec.lo; worked_minutes := rec.wm;
    has_out := rec.lo is not null and rec.lo > rec.fi;
    wmin := case when has_out then rec.wm else null end;
    late_minutes := 0; early_minutes := 0; pen := null; cov := null; work_date := d;

    if ov_status is not null then
      cat := ov_status;
      wu := case when ov_status = 'half_day' then 0.5 when ov_status = 'absent' then 0 else 1 end;
      lop := case when ov_status = 'absent' then 1 when ov_status = 'half_day' then 0.5 else 0 end;
      cov := 'manual';
    elsif v_ovr = 'holiday' then cat := 'holiday'; wu := 1; lop := 0; cov := 'override';
    elsif v_ovr = 'off' then cat := 'weekly_off'; wu := 1; lop := 0; cov := 'override';
    elsif v_ovr is null and is_holiday then cat := 'holiday'; wu := 1; lop := 0;
    elsif v_ovr is null and (dow = 0 or dow = 6) then cat := 'weekly_off'; wu := 1; lop := 0;
    elsif leave_full then cat := 'on_leave'; wu := 1; lop := 0; cov := 'leave';
    elsif rec.fi is null then
      if leave_half then cat := 'half_day'; wu := 0.5; lop := 0.5; cov := 'leave';
      elsif d >= v_today then cat := 'none'; wu := 0; lop := 0;
      else cat := 'absent'; wu := 0; lop := 1; end if;
    else
      arr := (rec.fi at time zone 'Asia/Kolkata')::time;
      dep := case when has_out then (rec.lo at time zone 'Asia/Kolkata')::time else null end;
      late_minutes := greatest(0, ceil(extract(epoch from (arr - g_start)) / 60))::int;
      if dep is not null then early_minutes := greatest(0, ceil(extract(epoch from (g_end - dep)) / 60))::int; end if;

      cat := 'present';
      if sl_hours > 0 then
        pen := 'short leave';
      else
        if arr > g_late_half then cat := 'half_day'; pen := 'late after ' || to_char(g_late_half, 'HH24:MI');
        elsif arr > (g_start + make_interval(mins => g_grace)) then
          late_used := late_used + 1;
          if late_used > grace_cnt then cat := 'half_day'; pen := 'repeated late'; else pen := 'late (grace)'; end if;
        end if;
        if cat <> 'half_day' and dep is not null then
          if dep < e_half_before then cat := 'half_day'; pen := 'left before ' || to_char(e_half_before, 'HH24:MI');
          elsif dep < (g_end - make_interval(mins => e_grace)) then
            early_used := early_used + 1;
            if early_used > grace_cnt then cat := 'half_day'; pen := 'repeated early out'; else pen := coalesce(pen, 'early (grace)'); end if;
          end if;
        end if;
        if cat <> 'half_day' and wmin is not null and wmin < half_hours * 60 then
          cat := 'half_day'; pen := 'worked < ' || half_hours || 'h';
        end if;
      end if;
      if cat = 'half_day' then
        if leave_half then wu := 1; lop := 0; cov := 'leave';
        else wu := 0.5; lop := 0.5; end if;
      else wu := 1; lop := 0; end if;
    end if;

    status := cat; worked_units := wu; lop_units := lop; penalty := pen; covered := cov;
    return next;
    d := d + 1;
  end loop;
end $function$;
