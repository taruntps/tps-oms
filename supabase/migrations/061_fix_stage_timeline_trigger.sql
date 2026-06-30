-- Migration 061: Fix trg_stage_timeline_capture — remove invalid enum value
--
-- The trigger checked for status IN ('completed','skipped','not_applicable')
-- but 'not_applicable' does not exist in the stage_status enum (valid values:
-- pending, in_progress, blocked, completed, skipped, not_required).
-- PostgreSQL tried to cast 'not_applicable' to stage_status on every stage
-- UPDATE and threw "invalid input value for enum stage_status: not_applicable".
-- Fixed to use 'not_required' which is the correct enum label.

create or replace function trg_stage_timeline_capture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignee uuid;
begin
  select coalesce(s.assigned_to, p.assigned_to)
  into v_assignee
  from stages s
  join projects p on p.id = s.project_id
  where s.id = new.id;

  if old.status <> 'in_progress' and new.status = 'in_progress' then
    perform close_open_timeline_row(new.id);
    insert into stage_timeline (project_id, stage_id, stage_code, clock_type, started_at, assigned_to)
    values (new.project_id, new.id, new.stage_code, new.active_clock, now(), v_assignee);
    return new;
  end if;

  if new.status = 'in_progress'
     and old.active_clock is distinct from new.active_clock then
    perform close_open_timeline_row(new.id);
    insert into stage_timeline (project_id, stage_id, stage_code, clock_type, started_at, assigned_to)
    values (new.project_id, new.id, new.stage_code, new.active_clock, now(), v_assignee);
    return new;
  end if;

  if old.status = 'in_progress'
     and new.status in ('completed', 'skipped', 'not_required') then
    perform close_open_timeline_row(new.id);
    return new;
  end if;

  return new;
end;
$$;
