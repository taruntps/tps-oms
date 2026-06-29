-- Migration 048: widen who can record payments and link Drive folders.
-- Decision: "all staff except auditor" may record payments and link a client/
-- project Google Drive folder. Auditor stays read-only.

-- ── Item 4: payments insert — all staff except auditor ─────────────────────────
drop policy if exists "payments_insert_accounts_up" on payments;
create policy "payments_insert_all_staff" on payments
  for insert with check (
    has_role('super_admin','director','manager','executive','accounts','hr')
  );

-- ── Item 2: link a Drive folder without granting broad UPDATE on clients/projects.
-- A narrow SECURITY DEFINER RPC that ONLY sets drive_folder_id, gated to staff.
create or replace function set_entity_drive_folder(
  p_table     text,
  p_id        uuid,
  p_folder_id text   -- pass null to unlink
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_role('super_admin','director','manager','executive','accounts','hr') then
    raise exception 'Not authorised to link a Drive folder';
  end if;

  if p_table = 'clients' then
    update clients  set drive_folder_id = p_folder_id where id = p_id;
  elsif p_table = 'projects' then
    update projects set drive_folder_id = p_folder_id where id = p_id;
  else
    raise exception 'Invalid table: %', p_table;
  end if;
end;
$$;

revoke execute on function set_entity_drive_folder(text, uuid, text) from anon;
grant  execute on function set_entity_drive_folder(text, uuid, text) to authenticated;
