-- Migration 059: Allow executives to insert and update licenses
--
-- Problem: licenses_insert and licenses_update policies only allowed
-- super_admin, director, manager. Executives (like Prabhjot Kaur) were
-- blocked when trying to add/update FSSAI licenses for clients.

drop policy if exists "licenses_insert" on licenses;
drop policy if exists "licenses_update" on licenses;

create policy "licenses_insert" on licenses
  for insert
  with check (
    has_role('super_admin', 'director', 'manager', 'executive')
  );

create policy "licenses_update" on licenses
  for update
  using (
    has_role('super_admin', 'director', 'manager', 'executive')
  );
