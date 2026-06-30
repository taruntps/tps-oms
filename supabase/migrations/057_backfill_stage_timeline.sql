-- Migration 057: Backfill stage_timeline + fix rpc_project_timeline
--
-- Problem: create_initial_timeline() created project-level stubs with stage_id=null.
-- Fix:
--   1. Delete null-stage stubs (no useful data)
--   2. Backfill open rows for currently in_progress stages
--   3. Backfill closed rows for completed/skipped stages
--   4. Update rpc_project_timeline to skip null-stage rows

delete from stage_timeline where stage_id is null;

insert into stage_timeline (project_id, stage_id, stage_code, clock_type, started_at, assigned_to)
select
  s.project_id,
  s.id,
  s.stage_code,
  coalesce(s.active_clock, 'employee'),
  coalesce(s.started_at, p.created_at, now()),
  coalesce(s.assigned_to, p.assigned_to)
from stages s
join projects p on p.id = s.project_id
where s.status = 'in_progress'
  and not exists (
    select 1 from stage_timeline st
    where st.stage_id = s.id and st.ended_at is null
  );

insert into stage_timeline (project_id, stage_id, stage_code, clock_type, started_at, ended_at, assigned_to)
select
  s.project_id,
  s.id,
  s.stage_code,
  coalesce(s.active_clock, 'employee'),
  coalesce(s.started_at, p.created_at, now()),
  coalesce(s.completed_at, now()),
  coalesce(s.assigned_to, p.assigned_to)
from stages s
join projects p on p.id = s.project_id
where s.status in ('completed', 'skipped')
  and not exists (
    select 1 from stage_timeline st
    where st.stage_id = s.id
  );

create or replace function rpc_project_timeline(p_project_id uuid)
returns table(
  stage_order      smallint,
  stage_name       text,
  stage_code       text,
  stage_status     text,
  stage_due_date   date,
  clock_type       text,
  assignee_name    text,
  started_at       timestamptz,
  ended_at         timestamptz,
  duration_days    numeric,
  is_open          boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    vst.stage_order,
    vst.stage_name,
    vst.stage_code,
    vst.stage_status::text,
    vst.stage_due_date,
    vst.clock_type::text,
    vst.assignee_name,
    vst.started_at,
    vst.ended_at,
    vst.duration_days,
    (vst.ended_at is null) as is_open
  from v_stage_timeline vst
  where vst.project_id = p_project_id
    and vst.stage_id is not null
  order by vst.stage_order, vst.started_at;
$$;
