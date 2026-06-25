-- Migration 020: admin password reset RPC
-- Lets a super_admin/director set a new password for any user. Passwords are stored
-- as a bcrypt hash (irreversible) — this overwrites the hash. Self-service password
-- change uses supabase.auth.updateUser() on the client (no RPC needed).

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
end;
$$;
