-- Migration 030: Workflow Redesign — Phase 1 Foundation (additive, back-compat).
-- Existing projects/stages/clients are untouched. New columns default safely.
-- See docs/STAGE-REDESIGN-NOTES.md (spec) and docs/STAGE-REDESIGN-PLAN.md (plan).

-- ── B2: relax project_name (stop requiring it; keep column for back-compat) ──
alter table projects alter column project_name drop not null;
alter table projects alter column project_name set default '';

-- ── Per-stage clock (B1 foundation) + doc-status + stage_kind ──
alter table stages
  add column if not exists active_clock clock_type not null default 'employee',
  add column if not exists doc_status   text,                       -- 'partial' | 'completed' (doc-collection stages)
  add column if not exists stage_kind   text not null default 'work'; -- work|doc_collection|submit_fssai|status_fssai|fee|entry|review_loop
-- backfill per-stage clock from the project's current clock so behaviour is preserved
update stages s set active_clock = p.active_clock
  from projects p where p.id = s.project_id and s.active_clock = 'employee';

alter table stage_templates
  add column if not exists stage_kind text not null default 'work';

-- ── Multi-product layer (Artwork; Phase 5 uses it) ──
create table if not exists project_products (
  id           uuid primary key default uuid_generate_v4(),
  project_id   uuid not null references projects(id) on delete cascade,
  product_no   smallint not null,
  product_name text not null,
  status       text not null default 'active',
  created_at   timestamptz not null default now(),
  unique (project_id, product_no)
);
alter table project_products enable row level security;
drop policy if exists project_products_select on project_products;
create policy project_products_select on project_products for select to authenticated using (true);
drop policy if exists project_products_write on project_products;
create policy project_products_write on project_products for all to authenticated
  using (auth.uid() is not null) with check (auth.uid() is not null);

alter table stages
  add column if not exists product_id uuid references project_products(id) on delete cascade;

-- ── Working-day due-date helper (skips Sat/Sun; holiday table pluggable later) ──
create or replace function fn_add_working_days(p_start date, p_days int)
returns date language plpgsql immutable as $$
declare d date := p_start; added int := 0;
begin
  if p_days is null or p_days <= 0 then return p_start; end if;
  while added < p_days loop
    d := d + 1;
    if extract(isodow from d) < 6 then  -- Mon..Fri = 1..5
      added := added + 1;
    end if;
  end loop;
  return d;
end; $$;

-- ── B9: completion counts not_required + guards blocked; B10: zero-quote payment ──
create or replace function fn_sync_project_completion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_project uuid := coalesce(new.project_id, old.project_id);
  v_total int; v_done int; v_status project_status; v_blocked boolean;
begin
  select count(*), count(*) filter (where status in ('completed','skipped','not_required'))
    into v_total, v_done from stages where project_id = v_project;
  select status, is_blocked into v_status, v_blocked from projects where id = v_project;

  if v_total > 0 and v_done = v_total and v_status = 'active' and not coalesce(v_blocked,false) then
    update projects set status = 'completed', completed_date = current_date, updated_at = now()
      where id = v_project;
  elsif v_done < v_total and v_status = 'completed' then
    update projects set status = 'active', completed_date = null, updated_at = now()
      where id = v_project;
  end if;
  return null;
end; $$;

create or replace function fn_recalc_project_payment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_project uuid := coalesce(new.project_id, old.project_id); v_paid bigint; v_quoted bigint;
begin
  select coalesce(sum(amount),0) into v_paid from payments where project_id = v_project;
  select quoted_amount into v_quoted from projects where id = v_project;
  update projects set
    paid_amount = v_paid,
    payment_status = (case
      when v_paid <= 0     then 'pending'
      when coalesce(v_quoted,0) <= 0 then 'paid'   -- paid>0 with no/zero quote = fully paid
      when v_paid >= v_quoted then 'paid'
      else 'partial'
    end)::payment_status,
    updated_at = now()
  where id = v_project;
  return null;
end; $$;
