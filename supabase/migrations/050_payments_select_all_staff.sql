-- Migration 050: let all staff read payments (so executives/hr can see the
-- payments they record, and the .insert().select() returning row passes RLS).
-- Previously payments_select excluded executive & hr → an executive could pass
-- the INSERT check but the returning SELECT failed with an RLS violation.

drop policy if exists "payments_select" on payments;
create policy "payments_select" on payments
  for select using (
    has_role('super_admin','director','manager','executive','accounts','hr','auditor')
  );

-- Clean up: the original insert policy is now superseded by payments_insert_all_staff
-- (migration 048), which already covers all of these roles plus more.
drop policy if exists "payments_insert" on payments;
