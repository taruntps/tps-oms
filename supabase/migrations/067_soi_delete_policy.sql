-- Migration 067: allow admins to delete SOI archive entries
-- Bug: soi_archive had no DELETE policy, so deletes silently affected 0 rows
-- while soi_products (which has ALL policy) lost its rows — orphaning the SOI.

create policy "soi_delete_admin" on soi_archive
  for delete using (has_role('super_admin','director','manager'));

-- Also allow updating (e.g. description edits) for the same roles
create policy "soi_update_admin" on soi_archive
  for update using (has_role('super_admin','director','manager'));
