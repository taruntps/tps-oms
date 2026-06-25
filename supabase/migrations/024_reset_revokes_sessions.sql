-- Migration 024: an admin password reset also revokes the user's existing sessions,
-- so they are forced to log in again (no cached session survives). Self-service
-- change handles its own logout on the client.

create or replace function admin_reset_password(p_user_id uuid, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not has_role('super_admin', 'director') then
    raise exception 'Only an admin can reset passwords';
  end if;
  if length(coalesce(p_new_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  update auth.users
     set encrypted_password = crypt(p_new_password, gen_salt('bf')),
         updated_at = now()
   where id = p_user_id;
  if not found then raise exception 'User not found'; end if;

  -- Revoke all of this user's sessions / refresh tokens → forced re-login.
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  delete from auth.sessions       where user_id = p_user_id;
end;
$$;
