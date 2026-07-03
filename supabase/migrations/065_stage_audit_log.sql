-- Migration 065: Stage Audit Log
-- Records every UPDATE on the stages table — who changed what, when, with old vs new values.
-- Only changed fields are stored (excluding updated_at noise). Triggered via SECURITY DEFINER
-- so auth.uid() is always populated (the Supabase session user).

-- ── Table ──────────────────────────────────────────────────────────────────
create table if not exists stage_audit_log (
  id          uuid        primary key default gen_random_uuid(),
  stage_id    uuid        not null references stages(id)   on delete cascade,
  project_id  uuid        not null references projects(id) on delete cascade,
  stage_name  text,
  changed_by  uuid        references profiles(id) on delete set null,
  changed_at  timestamptz not null default now(),
  old_values  jsonb       not null default '{}'::jsonb,
  new_values  jsonb       not null default '{}'::jsonb
);

create index if not exists stage_audit_log_project_id_idx on stage_audit_log(project_id, changed_at desc);
create index if not exists stage_audit_log_stage_id_idx   on stage_audit_log(stage_id);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table stage_audit_log enable row level security;

-- Any authenticated user can read audit log (managers, executives, etc.)
create policy "stage_audit_log_read" on stage_audit_log
  for select using (auth.role() = 'authenticated');

-- Only the trigger function (SECURITY DEFINER) can insert — block direct writes
create policy "stage_audit_log_insert" on stage_audit_log
  for insert with check (false);

-- ── Trigger function ───────────────────────────────────────────────────────
create or replace function fn_audit_stage_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row  jsonb := to_jsonb(OLD);
  new_row  jsonb := to_jsonb(NEW);
  old_vals jsonb := '{}'::jsonb;
  new_vals jsonb := '{}'::jsonb;
  k        text;
begin
  -- Compute the diff: only store fields that actually changed
  for k in select jsonb_object_keys(new_row)
  loop
    if (old_row->k) is distinct from (new_row->k) then
      old_vals := old_vals || jsonb_build_object(k, old_row->k);
      new_vals := new_vals || jsonb_build_object(k, new_row->k);
    end if;
  end loop;

  -- Drop noise-only fields so they don't create empty log entries
  old_vals := old_vals - 'updated_at';
  new_vals := new_vals - 'updated_at';

  if new_vals <> '{}'::jsonb then
    insert into stage_audit_log (stage_id, project_id, stage_name, changed_by, old_values, new_values)
    values (
      NEW.id,
      NEW.project_id,
      NEW.stage_name,
      auth.uid(),
      old_vals,
      new_vals
    );
  end if;

  return NEW;
end;
$$;

-- ── Attach trigger ─────────────────────────────────────────────────────────
drop trigger if exists trg_audit_stage_changes on stages;
create trigger trg_audit_stage_changes
  after update on stages
  for each row
  execute function fn_audit_stage_changes();
