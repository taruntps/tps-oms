-- Migration 081 — my_permissions(): the current user's effective permission set (Wave 1).
-- Powers the frontend useCan() hook (one call, cached). super_admin => every permission at 'all'.
create or replace function public.my_permissions()
returns table(perm_key text, scope text)
language sql stable security definer set search_path to 'public' as $$
  with me as (select auth.uid() as uid),
  is_super as (select exists(select 1 from public.user_roles ur, me where ur.user_id=me.uid and ur.role_key='super_admin') as ok),
  eff_roles as (
    select ur.role_key from public.user_roles ur, me where ur.user_id=me.uid
    union
    select ur.role_key from public.delegations d join public.user_roles ur on ur.user_id=d.from_user, me
    where d.to_user=me.uid and now() between d.valid_from and d.valid_to
  ),
  base as (
    select p.perm_key, 'all'::text as scope from public.permissions p where (select ok from is_super)
    union all
    select rp.perm_key, max(rp.scope) from public.role_permissions rp join eff_roles er on er.role_key=rp.role_key
      where not (select ok from is_super) group by rp.perm_key
  ),
  ov as (select o.perm_key, o.scope, o.granted from public.user_permission_overrides o, me where o.user_id=me.uid)
  select b.perm_key, coalesce((select scope from ov where ov.perm_key=b.perm_key and granted), b.scope) as scope
  from base b where not exists (select 1 from ov where ov.perm_key=b.perm_key and not ov.granted)
  union
  select o.perm_key, o.scope from ov o where o.granted and not exists (select 1 from base b where b.perm_key=o.perm_key);
$$;
