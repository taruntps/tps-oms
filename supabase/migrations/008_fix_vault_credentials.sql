-- Migration 008: Fix FSSAI credential storage (supabase_vault 0.3.x)
--
-- ROOT CAUSE: store_fssai_credential() (migration 004) did
--     select id::text into v_secret_id from vault.create_secret(...)
-- but vault.create_secret() returns a SCALAR uuid, not a row with an `id` column.
-- Postgres therefore raised "column id does not exist", the function aborted, and no
-- credential was ever stored — which also made reveal report
-- "No credential stored for this license".
--
-- FIX: capture the scalar return correctly, and use vault.update_secret() for
-- re-saves. These wrapper functions are SECURITY DEFINER (owner = supabase_admin),
-- so they carry the pgsodium crypto grants needed to encrypt/decrypt — a plain
-- INSERT into vault.secrets from our own function would fail on crypto permissions.

-- ── STORE ──────────────────────────────────────────────────────────────────────
create or replace function store_fssai_credential(
  p_license_id  uuid,
  p_username    text,
  p_password    text,   -- plaintext, encrypted by Vault on insert
  p_reason      text default 'Initial setup'
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
  -- Only manager+ can store credentials
  if not has_role('super_admin', 'director', 'manager') then
    raise exception 'Insufficient privileges to store credentials';
  end if;

  v_secret_name := 'fssai_cred_' || p_license_id::text;

  -- Reuse an existing secret for this licence if one is already linked …
  select vault_credential_id into v_secret_id
  from licenses where id = p_license_id;

  -- … or one was created by a prior (failed) attempt under the same name
  if v_secret_id is null then
    select id::text into v_secret_id
    from vault.secrets where name = v_secret_name;
  end if;

  if v_secret_id is not null then
    -- Re-save: update the existing Vault secret in place
    perform vault.update_secret(v_secret_id::uuid, p_password);
  else
    -- First save: create_secret returns a SCALAR uuid (capture it directly)
    v_secret_id := vault.create_secret(
      p_password,
      v_secret_name,
      'FSSAI portal password for license ' || p_license_id::text
    )::text;
  end if;

  -- Link the licence to its secret; keep existing username if a blank one is passed
  update licenses
  set
    vault_credential_id = v_secret_id,
    credential_username = coalesce(nullif(p_username, ''), credential_username),
    updated_at          = now()
  where id = p_license_id;

  -- Audit log
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

-- ── REVEAL ─────────────────────────────────────────────────────────────────────
-- Unchanged logic, re-declared for completeness (reads vault.decrypted_secrets).
create or replace function reveal_fssai_credential(
  p_license_id  uuid,
  p_reason      text default 'Portal access required'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret_id text;
  v_password  text;
begin
  if not has_role('super_admin', 'director', 'manager', 'executive') then
    raise exception 'Insufficient privileges to reveal credentials';
  end if;

  select vault_credential_id into v_secret_id
  from licenses where id = p_license_id;

  if v_secret_id is null then
    raise exception 'No credential stored for this license';
  end if;

  select decrypted_secret into v_password
  from vault.decrypted_secrets
  where id = v_secret_id::uuid;

  update licenses
  set
    last_credential_accessed_at = now(),
    last_credential_accessed_by = auth.uid()
  where id = p_license_id;

  insert into credential_access_log(license_id, accessed_by, reason)
  values (p_license_id, auth.uid(), p_reason);

  insert into audit_log(user_id, action, table_name, record_id, new_data)
  values (
    auth.uid(),
    'credential_reveal',
    'licenses',
    p_license_id,
    jsonb_build_object('reason', p_reason)
  );

  return v_password;
end;
$$;
