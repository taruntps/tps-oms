-- 117 — Admin attendance punch corrections.
-- Lets super_admin/director/hr correct raw In/Out punch timing (add / edit / delete a punch)
-- so evaluate_attendance recomputes status/late/half and payroll follows automatically.
-- Each RPC is SECURITY DEFINER, role-gated (null role => DENY via coalesce), and writes an
-- audit row to hr_attendance_corrections. Admin-added punches are tagged source='manual';
-- edits keep their original source (provenance) and are recorded only in the audit trail.

create or replace function public.admin_add_punch(
  p_employee uuid, p_at timestamptz, p_reason text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not coalesce(auth_role() = any (array['super_admin','director','hr']::user_role[]), false) then
    raise exception 'Not authorized to edit attendance punches';
  end if;
  if p_employee is null or p_at is null then
    raise exception 'Employee and time are required';
  end if;

  insert into attendance_punches (user_id, punch_at, within_fence, is_field, source, device_info)
  values (p_employee, p_at, true, false, 'manual', 'Admin correction')
  returning id into v_id;

  insert into hr_attendance_corrections (employee_id, work_date, field, old_value, new_value, reason, corrected_by)
  values (p_employee, (p_at at time zone 'Asia/Kolkata')::date, 'punch_add',
          null, to_char(p_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI'),
          p_reason, auth.uid());

  return v_id;
end $$;

create or replace function public.admin_edit_punch(
  p_punch_id uuid, p_new_time timestamptz, p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_old timestamptz; v_emp uuid;
begin
  if not coalesce(auth_role() = any (array['super_admin','director','hr']::user_role[]), false) then
    raise exception 'Not authorized to edit attendance punches';
  end if;
  if p_new_time is null then raise exception 'New time is required'; end if;

  select punch_at, user_id into v_old, v_emp from attendance_punches where id = p_punch_id;
  if not found then raise exception 'Punch not found'; end if;

  update attendance_punches set punch_at = p_new_time where id = p_punch_id;

  insert into hr_attendance_corrections (employee_id, work_date, field, old_value, new_value, reason, corrected_by)
  values (v_emp, (p_new_time at time zone 'Asia/Kolkata')::date, 'punch_edit',
          to_char(v_old at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI'),
          to_char(p_new_time at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI'),
          p_reason, auth.uid());
end $$;

create or replace function public.admin_delete_punch(
  p_punch_id uuid, p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_old timestamptz; v_emp uuid;
begin
  if not coalesce(auth_role() = any (array['super_admin','director','hr']::user_role[]), false) then
    raise exception 'Not authorized to edit attendance punches';
  end if;

  select punch_at, user_id into v_old, v_emp from attendance_punches where id = p_punch_id;
  if not found then raise exception 'Punch not found'; end if;

  delete from attendance_punches where id = p_punch_id;

  insert into hr_attendance_corrections (employee_id, work_date, field, old_value, new_value, reason, corrected_by)
  values (v_emp, (v_old at time zone 'Asia/Kolkata')::date, 'punch_delete',
          to_char(v_old at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI'),
          null, p_reason, auth.uid());
end $$;

grant execute on function public.admin_add_punch(uuid, timestamptz, text) to authenticated;
grant execute on function public.admin_edit_punch(uuid, timestamptz, text) to authenticated;
grant execute on function public.admin_delete_punch(uuid, text) to authenticated;
