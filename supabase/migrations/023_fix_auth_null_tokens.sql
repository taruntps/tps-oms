-- Migration 023: fix "Database error querying schema" on login for SQL-created users
--
-- GoTrue scans auth.users token columns into non-nullable Go strings. Users created
-- by raw INSERT left these as NULL (the Admin API sets them to ''), so login failed
-- with a 500 "Database error querying schema". Fix: (1) backfill existing rows,
-- (2) make admin_create_user set them to '' going forward.

-- ── 1. Backfill any rows with NULL token fields ──────────────────────────────
update auth.users set
  confirmation_token      = coalesce(confirmation_token, ''),
  recovery_token          = coalesce(recovery_token, ''),
  email_change            = coalesce(email_change, ''),
  email_change_token_new  = coalesce(email_change_token_new, '')
where confirmation_token is null
   or recovery_token is null
   or email_change is null
   or email_change_token_new is null;

-- ── 2. admin_create_user — set token fields to '' on insert ──────────────────
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
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    lower(p_email), crypt(p_password, gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('name', p_name, 'role', p_role, 'email_verified', true),
    '', '', '', '');

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
