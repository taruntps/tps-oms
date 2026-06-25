-- Migration 022: admin_create_user RPC — create an account (auth user + identity +
-- profile) directly, with an Employee Code. Lets non-email staff log in by code:
-- the UI passes a synthetic email (e.g. t007@emp.tpsxpert.com) for code-only users,
-- and login resolves the code → that email (migration 021). super_admin/director only.

create or replace function admin_create_user(
  p_email          text,
  p_password       text,
  p_name           text,
  p_role           text,
  p_employee_code  text default null,
  p_phone          text default null,
  p_whatsapp       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_id uuid := gen_random_uuid();
begin
  if not has_role('super_admin', 'director') then
    raise exception 'Only an admin can create users';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if coalesce(trim(p_email), '') = '' then
    raise exception 'An email or Employee Code is required';
  end if;
  if exists (select 1 from auth.users where lower(email) = lower(p_email)) then
    raise exception 'A user with this email / ID already exists';
  end if;
  if p_employee_code is not null and exists (
    select 1 from profiles where lower(employee_code) = lower(p_employee_code)
  ) then
    raise exception 'Employee code % is already in use', p_employee_code;
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    lower(p_email), crypt(p_password, gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('name', p_name, 'role', p_role, 'email_verified', true));

  insert into auth.identities (id, user_id, provider, provider_id, identity_data,
    last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, 'email', v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', lower(p_email), 'email_verified', true, 'phone_verified', false),
    now(), now(), now());

  insert into profiles (id, name, email, role, is_active, employee_code, phone, whatsapp_number)
  values (v_id, p_name, lower(p_email), p_role::user_role, true, p_employee_code, p_phone, p_whatsapp);

  return v_id;
end;
$$;
