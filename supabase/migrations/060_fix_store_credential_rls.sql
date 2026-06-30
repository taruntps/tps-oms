-- Migration 060: Allow executives to store FSSAI credentials
--
-- store_fssai_credential blocked executives with "Insufficient privileges".
-- Executives add licences and must be able to store the portal password too.

create or replace function store_fssai_credential(
  p_license_id uuid,
  p_username   text,
  p_password   text,
  p_reason     text default 'Set via portal'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret_id   text;
  v_secret_name text;
begin
  if not has_role('super_admin', 'director', 'manager', 'executive') then
    raise exception 'Insufficient privileges to store credentials';
  end if;

  v_secret_name := 'fssai_cred_' || p_license_id::text;

  select vault_credential_id into v_secret_id
  from licenses where id = p_license_id;

  if v_secret_id is null then
    select id::text into v_secret_id
    from vault.secrets where name = v_secret_name;
  end if;

  if v_secret_id is not null then
    perform vault.update_secret(v_secret_id::uuid, p_password);
  else
    v_secret_id := vault.create_secret(
      p_password,
      v_secret_name,
      'FSSAI portal password for license ' || p_license_id::text
    )::text;
  end if;

  update licenses
  set
    vault_credential_id = v_secret_id,
    credential_username = coalesce(nullif(p_username, ''), credential_username),
    updated_at          = now()
  where id = p_license_id;

  insert into audit_log(user_id, action, table_name, record_id, new_data)
  values (
    auth.uid(),
    'credential_store',
    'licenses',
    p_license_id,
    jsonb_build_object('username', p_username, 'reason', p_reason)
  );
end;
$$;
