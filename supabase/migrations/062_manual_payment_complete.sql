-- Migration 062: Manual payment completion only
--
-- Changes:
-- 1. fn_recalc_project_payment no longer auto-sets payment_status = 'paid'.
--    Only 'pending' and 'partial' are set automatically.
--    'paid' is set exclusively by the manual "Mark Payment Complete" action.
-- 2. paid_amount now excludes govt fees (Client-paid, TPS-paid) so the
--    Director's pending-payment calculations reflect consulting revenue only.
-- 3. A guard: if payment_status is already 'paid', the trigger does nothing
--    (prevents accidental revert on a new govt-fee payment being recorded).

create or replace function fn_recalc_project_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid := coalesce(new.project_id, old.project_id);
  v_paid    bigint;
begin
  -- Only consulting fees count toward paid_amount (exclude govt pass-through)
  select coalesce(sum(amount), 0) into v_paid
  from payments
  where project_id = v_project
    and payment_mode not in ('Client-paid', 'TPS-paid');

  -- Never auto-overwrite a manually confirmed 'paid' status
  update projects
  set
    paid_amount    = v_paid,
    payment_status = (case when v_paid > 0 then 'partial' else 'pending' end)::payment_status,
    updated_at     = now()
  where id = v_project
    and payment_status <> 'paid';

  return null;
end;
$$;
