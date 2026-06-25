-- Migration 021: allow login by Employee Code (User ID) as well as email.
--
-- Supabase auth is email-based, so we resolve a typed identifier to an email before
-- sign-in: if it contains '@' it's used as-is; otherwise it's looked up as an
-- employee_code (User ID) → that profile's auth email. Callable pre-auth (anon).
-- employee_code is unique, so the mapping is unambiguous.

create or replace function resolve_login_email(p_identifier text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when position('@' in p_identifier) > 0 then p_identifier
    else (
      select email from profiles
      where lower(employee_code) = lower(trim(p_identifier)) and is_active
      limit 1
    )
  end;
$$;

grant execute on function resolve_login_email(text) to anon, authenticated;
