-- CAPA S-2: replace "USING(true)" ALL policies on cancel_requests, delete_requests,
-- query_points, soi_products with scoped rules preserving current staff access.
-- (Applied via MCP 2026-07-11. Full DDL in git history / audit report.)
drop policy if exists "auth write soi_products" on soi_products;
drop policy if exists "auth read soi_products"  on soi_products;
drop policy if exists "auth write query_points" on query_points;
create policy "query_points_write_staff" on query_points for all to authenticated
  using (has_role('super_admin','director','manager','executive'))
  with check (has_role('super_admin','director','manager','executive'));
drop policy if exists "auth write cancel_requests" on cancel_requests;
create policy "cancel_requests_insert_own" on cancel_requests for insert to authenticated with check (requested_by = auth.uid());
create policy "cancel_requests_modify_admin" on cancel_requests for update to authenticated using (has_role('super_admin','director','manager'));
create policy "cancel_requests_delete_admin" on cancel_requests for delete to authenticated using (has_role('super_admin','director','manager'));
drop policy if exists "auth write delete_requests" on delete_requests;
create policy "delete_requests_insert_auth" on delete_requests for insert to authenticated with check (auth.uid() is not null);
create policy "delete_requests_modify_admin" on delete_requests for update to authenticated using (has_role('super_admin','director','manager'));
create policy "delete_requests_delete_admin" on delete_requests for delete to authenticated using (has_role('super_admin','director','manager'));
