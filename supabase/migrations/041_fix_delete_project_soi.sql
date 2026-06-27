-- 041 — delete_project referenced soi_products.project_id, which migration 040
-- removed (soi_products now links to soi_archive via soi_id). Because the function
-- runs under session_replication_role = replica, the ON DELETE CASCADE from
-- soi_archive does NOT fire, so soi_products must be deleted explicitly by soi_id.

create or replace function public.delete_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  delete from soi_products      where soi_id in (select id from soi_archive where project_id = p_project_id);
  delete from soi_archive       where project_id = p_project_id;
  delete from projects          where id = p_project_id;
  set local session_replication_role = origin;
end;
$function$;
