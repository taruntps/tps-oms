-- 103 — admin_set_portal_role: grant/revoke a user's RBAC portal role (user_roles)
-- from the User Management "Portal role" tick. Keeps exactly one user_roles row
-- matching profiles.role (or none). SECURITY DEFINER, admin-guarded.
-- Fixes: new employees / role changes not syncing user_roles → has_perm() broken.

create or replace function public.admin_set_portal_role(p_user_id uuid, p_grant boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  if not has_role('super_admin', 'director') then
    raise exception 'Insufficient privileges to manage portal roles';
  end if;
  delete from public.user_roles where user_id = p_user_id;
  if p_grant then
    select role::text into v_role from public.profiles where id = p_user_id;
    if v_role is null then raise exception 'This employee has no role set'; end if;
    insert into public.user_roles (user_id, role_key, granted_by) values (p_user_id, v_role, auth.uid());
  end if;
end $$;

revoke execute on function public.admin_set_portal_role(uuid, boolean) from anon;
