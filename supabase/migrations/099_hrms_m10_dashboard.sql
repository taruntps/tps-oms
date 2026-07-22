-- Migration 099 — HRMS M10: Dashboards & Reports. EXPAND only (additive).
-- Non-PII aggregate RPC for HR/Director/Manager dashboards + one permission. No new tables.
insert into public.permissions (perm_key, module, label) values
  ('hrms.dashboard.view','hrms','View HRMS dashboards & reports')
on conflict (perm_key) do nothing;

insert into public.role_permissions (role_key, perm_key, scope)
select r.role_key, 'hrms.dashboard.view', 'all'
from (values ('super_admin'),('director'),('hr'),('manager'),('auditor')) r(role_key)
on conflict do nothing;

-- Aggregate counts only (no employee-identifying data). Guarded by permission.
create or replace function public.hr_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if not has_perm('hrms.dashboard.view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'headcount', (select count(*) from profiles where is_active is true),
    'on_leave_today', (select count(distinct employee_id) from hr_leave_requests
                        where status = 'approved' and current_date between from_date and to_date),
    'pending_leave', (select count(*) from hr_leave_requests where status = 'pending'),
    'pending_attendance', (select count(*) from hr_attendance_regularizations where status = 'pending'),
    'open_requisitions', (select count(*) from hr_job_requisitions
                           where status = any (array['draft','pending','approved','on_hold'])),
    'pending_reviews', (select count(*) from hr_reviews where status = 'pending'),
    'expiring_certs', (select count(*) from hr_certifications
                        where expires_on is not null and expires_on between current_date and current_date + 30),
    'assets_issued', (select count(*) from hr_assets where status = 'issued')
  ) into result;

  return result;
end;
$$;

grant execute on function public.hr_dashboard_stats() to authenticated;
