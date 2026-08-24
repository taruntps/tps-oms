-- 132 — Admin-only RPC backing the Manage Access panel. For a target employee, returns
-- every permission with whether their ROLE grants it and whether an explicit override
-- exists (true/false/null). Lets the panel show real current state (follow-role +
-- overrides) and compute the minimal override rows to write on save. Gated so only
-- super_admin / director callers get rows.
create or replace function public.user_access_state(p_uid uuid)
returns table(perm_key text, role_granted boolean, override_granted boolean)
language sql stable security definer set search_path to 'public' as $$
  with roleg as (
    select distinct rp.perm_key
    from public.user_roles ur
    join public.role_permissions rp on rp.role_key = ur.role_key
    where ur.user_id = p_uid
  ),
  ov as (
    select perm_key, granted from public.user_permission_overrides where user_id = p_uid
  )
  select a.perm_key,
         (a.perm_key in (select perm_key from roleg)) as role_granted,
         (select granted from ov where ov.perm_key = a.perm_key) as override_granted
  from public.permissions a
  where (select auth_role()) in ('super_admin'::user_role, 'director'::user_role);
$$;
grant execute on function public.user_access_state(uuid) to authenticated;
