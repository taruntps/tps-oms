-- Migration 016: roll payments up to the project + auto-complete projects
--
-- BUG 1: recording a payment never updated projects.paid_amount / payment_status,
-- so Overview showed PAID "—" and "Pending" even when fully paid.
-- BUG 3: when all stages were completed the project stayed 'active' (and the clock
-- strip still said "Currently with <name>"). Now it auto-completes.

-- ── Payment rollup ───────────────────────────────────────────────────────────
create or replace function fn_recalc_project_payment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_project uuid := coalesce(new.project_id, old.project_id);
  v_paid    bigint;
  v_quoted  bigint;
begin
  select coalesce(sum(amount), 0) into v_paid   from payments where project_id = v_project;
  select quoted_amount            into v_quoted from projects where id = v_project;
  update projects set
    paid_amount    = v_paid,
    payment_status = (case
      when v_paid <= 0                       then 'pending'
      when v_quoted > 0 and v_paid >= v_quoted then 'paid'
      else 'partial'
    end)::payment_status,
    updated_at = now()
  where id = v_project;
  return null;
end; $$;

drop trigger if exists trg_recalc_payment on payments;
create trigger trg_recalc_payment
  after insert or update or delete on payments
  for each row execute function fn_recalc_project_payment();

-- ── Auto-complete project when all stages are done ───────────────────────────
create or replace function fn_sync_project_completion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_project uuid := coalesce(new.project_id, old.project_id);
  v_total   int;
  v_done    int;
  v_status  project_status;
begin
  select count(*), count(*) filter (where status in ('completed','skipped'))
    into v_total, v_done from stages where project_id = v_project;
  select status into v_status from projects where id = v_project;

  if v_total > 0 and v_done = v_total and v_status = 'active' then
    update projects set status = 'completed', completed_date = current_date, updated_at = now()
    where id = v_project;
  elsif v_done < v_total and v_status = 'completed' then
    -- a stage was re-opened — revert to active
    update projects set status = 'active', completed_date = null, updated_at = now()
    where id = v_project;
  end if;
  return null;
end; $$;

drop trigger if exists trg_sync_completion on stages;
create trigger trg_sync_completion
  after insert or update or delete on stages
  for each row execute function fn_sync_project_completion();

-- ── Backfill existing data ───────────────────────────────────────────────────
update projects p set
  paid_amount = c.paid,
  payment_status = (case
    when c.paid <= 0                            then 'pending'
    when p.quoted_amount > 0 and c.paid >= p.quoted_amount then 'paid'
    else 'partial'
  end)::payment_status
from (select project_id, coalesce(sum(amount),0) as paid from payments group by project_id) c
where c.project_id = p.id;

update projects p set status = 'completed', completed_date = coalesce(completed_date, current_date)
where p.status = 'active'
  and exists (select 1 from stages s where s.project_id = p.id)
  and not exists (select 1 from stages s where s.project_id = p.id and s.status not in ('completed','skipped'));
