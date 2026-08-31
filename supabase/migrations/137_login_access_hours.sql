-- 137 — Per-employee login access hours (applied via Supabase migration of the same name).
-- hr_login_access: a row = that employee is RESTRICTED to [login_from, login_to] (IST) and,
-- optionally, blocked on holidays / weekly-offs. No row = unrestricted (default).
-- override_until = admin-granted one-time after-hours access. super_admin/director are ALWAYS
-- exempt. Enforced on the login screen (check_login_allowed) and for active sessions
-- (my_login_window_ok → AppShell auto-logout at the cutoff).
create table if not exists public.hr_login_access (
  employee_id      uuid primary key references public.profiles(id) on delete cascade,
  login_from       time not null default '08:30',
  login_to         time not null default '19:30',
  block_holidays   boolean not null default true,
  block_weekly_off boolean not null default true,
  override_until   timestamptz,
  updated_by       uuid,
  updated_at       timestamptz not null default now()
);
alter table public.hr_login_access enable row level security;
drop policy if exists hr_login_access_read on public.hr_login_access;
create policy hr_login_access_read on public.hr_login_access for select using (auth.uid() is not null);
drop policy if exists hr_login_access_write on public.hr_login_access;
create policy hr_login_access_write on public.hr_login_access for all
  using (auth_role() in ('super_admin','director')) with check (auth_role() in ('super_admin','director'));

-- eval_login_window(uid), check_login_allowed(identifier), my_login_window_ok()
-- (full bodies applied in the migration — see git history / the deployed functions).
