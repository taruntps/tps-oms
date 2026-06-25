-- Migration 026: relax client delete (block only on projects) + add project delete.
--
-- Client: a client with an FSSAI licence but NO project can now be deleted. The
-- only blocker is an existing project (payments / documents / soi all require a
-- project, so they cannot exist without one).
--
-- Project: "Cancel" keeps the record (status=cancelled); "Delete" removes it
-- permanently.
--
-- Both functions delete every child row explicitly in dependency order, then the
-- parent. We run the body under session_replication_role='replica' so the FK
-- cascade / RI triggers do NOT fire — those triggers raise
-- "referential integrity query ... gave unexpected result" in this database.
-- Integrity is preserved manually by deleting children first. SECURITY DEFINER +
-- owner postgres is required to set session_replication_role.

create or replace function delete_client(p_client_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role('super_admin','director') then
    raise exception 'Only an admin can delete clients';
  end if;
  if exists (select 1 from projects where client_id = p_client_id) then
    raise exception 'Cannot delete: this client has projects. Delete or cancel the projects first.';
  end if;

  set local session_replication_role = replica;
  delete from client_documents where client_id = p_client_id;
  delete from licenses         where client_id = p_client_id;
  delete from soi_products     where client_id = p_client_id;
  delete from clients          where id = p_client_id;
  set local session_replication_role = origin;
end;
$$;

create or replace function delete_project(p_project_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role('super_admin','director') then
    raise exception 'Only an admin can delete projects';
  end if;

  set local session_replication_role = replica;
  delete from query_points     where query_id in (select id from authority_queries where project_id = p_project_id);
  delete from authority_queries where project_id = p_project_id;
  delete from stage_timeline    where project_id = p_project_id;
  delete from stages            where project_id = p_project_id;
  delete from block_requests    where project_id = p_project_id;
  delete from cancel_requests   where project_id = p_project_id;
  delete from documents         where project_id = p_project_id;
  delete from payments          where project_id = p_project_id;
  delete from project_transfers where project_id = p_project_id;
  delete from soi_products      where project_id = p_project_id;
  delete from soi_archive       where project_id = p_project_id;
  delete from projects          where id = p_project_id;
  set local session_replication_role = origin;
end;
$$;
