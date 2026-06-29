-- Migration 056: Reporting views and RPCs for timeline analytics
--
-- Functions created:
--   rpc_project_timeline(p_project_id uuid)
--     → per-stage breakdown: TPS days, Client days, FSSAI days,
--       expected days, on-time flag, assignee per segment
--
--   rpc_stage_performance(p_stage_code text, p_service_type text)
--     → across all projects: avg/min/max days for this stage,
--       TPS/Client/FSSAI split, on-time rate
--
--   rpc_employee_timeline(p_employee_id uuid, p_from date, p_to date)
--     → project-wise + stage-wise + task-wise summary for one person
--
--   rpc_ontime_report(p_from date, p_to date, p_service_type text)
--     → all completed projects in date range: days taken vs target, variance

-- ── Helper view: stage_timeline with display names ────────────────────────────

create or replace view v_stage_timeline as
select
  st.id,
  st.project_id,
  st.stage_id,
  st.stage_code,
  st.clock_type,
  st.started_at,
  st.ended_at,
  -- Duration in decimal days (uses ended_at if closed, now() if still open)
  round(
    extract(epoch from (coalesce(st.ended_at, now()) - st.started_at)) / 86400.0,
    2
  ) as duration_days,
  st.assigned_to,
  pr.name  as assignee_name,
  p.project_code,
  p.service_type,
  p.target_date,
  p.completed_date,
  p.status  as project_status,
  s.stage_name,
  s.stage_order,
  s.status  as stage_status,
  s.due_date as stage_due_date
from stage_timeline st
join projects  p  on p.id  = st.project_id
left join stages    s  on s.id  = st.stage_id
left join profiles  pr on pr.id = st.assigned_to;

-- ── RPC 1: project_timeline ───────────────────────────────────────────────────
-- Returns one row per (stage × clock_type × assignee) segment.
-- Frontend aggregates into the per-stage summary table.

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
  order by vst.stage_order, vst.started_at;
$$;

-- ── RPC 2: stage_performance ──────────────────────────────────────────────────
-- Aggregate stats for a specific stage_code across all projects.
-- Pass null for p_stage_code to get all stages; null for p_service_type = all.

create or replace function rpc_stage_performance(
  p_stage_code    text default null,
  p_service_type  text default null
)
returns table(
  stage_code       text,
  stage_name       text,
  service_type     text,
  project_count    bigint,
  avg_days         numeric,
  min_days         numeric,
  max_days         numeric,
  tps_days_avg     numeric,
  client_days_avg  numeric,
  fssai_days_avg   numeric,
  ontime_pct       numeric
)
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select
      vst.stage_code,
      vst.stage_name,
      vst.service_type,
      vst.stage_id,
      vst.project_id,
      vst.stage_due_date,
      vst.stage_status,
      -- total days per stage (sum all segments for that stage)
      sum(vst.duration_days) as total_days,
      sum(case when vst.clock_type = 'employee'  then vst.duration_days else 0 end) as tps_days,
      sum(case when vst.clock_type = 'client'    then vst.duration_days else 0 end) as client_days,
      sum(case when vst.clock_type = 'authority' then vst.duration_days else 0 end) as fssai_days
    from v_stage_timeline vst
    where (p_stage_code   is null or vst.stage_code   = p_stage_code)
      and (p_service_type is null or vst.service_type = p_service_type)
      and vst.stage_id is not null
    group by vst.stage_code, vst.stage_name, vst.service_type, vst.stage_id,
             vst.project_id, vst.stage_due_date, vst.stage_status
  )
  select
    b.stage_code,
    b.stage_name,
    b.service_type,
    count(distinct b.stage_id)               as project_count,
    round(avg(b.total_days), 2)              as avg_days,
    round(min(b.total_days), 2)              as min_days,
    round(max(b.total_days), 2)              as max_days,
    round(avg(b.tps_days), 2)               as tps_days_avg,
    round(avg(b.client_days), 2)            as client_days_avg,
    round(avg(b.fssai_days), 2)             as fssai_days_avg,
    -- on-time: stage completed before or on due_date
    round(
      100.0 * count(*) filter (
        where b.stage_status in ('completed','skipped')
          and b.stage_due_date is not null
          and b.total_days <= (b.stage_due_date - current_date + b.total_days)
      ) / nullif(count(*) filter (where b.stage_status in ('completed','skipped')), 0),
    1) as ontime_pct
  from base b
  group by b.stage_code, b.stage_name, b.service_type
  order by b.service_type, b.stage_code;
$$;

-- ── RPC 3: employee_timeline ──────────────────────────────────────────────────
-- All stage segments handled by a specific employee in a date range.

create or replace function rpc_employee_timeline(
  p_employee_id  uuid,
  p_from         date default null,
  p_to           date default null
)
returns table(
  project_id     uuid,
  project_code   text,
  service_type   text,
  project_status text,
  target_date    date,
  completed_date date,
  stage_order    smallint,
  stage_name     text,
  stage_code     text,
  stage_status   text,
  clock_type     text,
  started_at     timestamptz,
  ended_at       timestamptz,
  duration_days  numeric,
  is_open        boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    vst.project_id,
    vst.project_code,
    vst.service_type,
    vst.project_status::text,
    vst.target_date,
    vst.completed_date,
    vst.stage_order,
    vst.stage_name,
    vst.stage_code,
    vst.stage_status::text,
    vst.clock_type::text,
    vst.started_at,
    vst.ended_at,
    vst.duration_days,
    (vst.ended_at is null) as is_open
  from v_stage_timeline vst
  where vst.assigned_to = p_employee_id
    and (p_from is null or vst.started_at::date >= p_from)
    and (p_to   is null or vst.started_at::date <= p_to)
  order by vst.started_at desc;
$$;

-- ── RPC 4: on-time delivery report ───────────────────────────────────────────

create or replace function rpc_ontime_report(
  p_from          date default null,
  p_to            date default null,
  p_service_type  text default null,
  p_employee_id   uuid default null
)
returns table(
  project_id       uuid,
  project_code     text,
  project_name     text,
  service_type     text,
  assignee_name    text,
  assigned_at      timestamptz,
  target_date      date,
  completed_date   date,
  total_days       numeric,
  tps_days         numeric,
  client_days      numeric,
  fssai_days       numeric,
  variance_days    numeric,
  result           text
)
language sql
security definer
set search_path = public
stable
as $$
  with clock_totals as (
    select
      st.project_id,
      round(sum(
        extract(epoch from (coalesce(st.ended_at, now()) - st.started_at)) / 86400.0
      ), 2) as total_days,
      round(sum(case when st.clock_type = 'employee'  then
        extract(epoch from (coalesce(st.ended_at, now()) - st.started_at)) / 86400.0
        else 0 end), 2) as tps_days,
      round(sum(case when st.clock_type = 'client' then
        extract(epoch from (coalesce(st.ended_at, now()) - st.started_at)) / 86400.0
        else 0 end), 2) as client_days,
      round(sum(case when st.clock_type = 'authority' then
        extract(epoch from (coalesce(st.ended_at, now()) - st.started_at)) / 86400.0
        else 0 end), 2) as fssai_days
    from stage_timeline st
    group by st.project_id
  )
  select
    p.id             as project_id,
    p.project_code,
    p.project_name,
    p.service_type,
    pr.name          as assignee_name,
    p.assigned_at,
    p.target_date,
    p.completed_date,
    coalesce(ct.total_days, 0)  as total_days,
    coalesce(ct.tps_days, 0)    as tps_days,
    coalesce(ct.client_days, 0) as client_days,
    coalesce(ct.fssai_days, 0)  as fssai_days,
    -- variance: negative = early, positive = late
    case
      when p.target_date is null or p.completed_date is null then null
      else (p.completed_date - p.target_date)::numeric
    end as variance_days,
    case
      when p.status = 'active'    then 'active'
      when p.status = 'on_hold'   then 'on_hold'
      when p.status = 'cancelled' then 'cancelled'
      when p.completed_date is null or p.target_date is null then 'completed'
      when p.completed_date <= p.target_date then 'on_time'
      else 'delayed'
    end as result
  from projects p
  left join profiles    pr on pr.id = p.assigned_to
  left join clock_totals ct on ct.project_id = p.id
  where (p_from         is null or p.created_at::date >= p_from)
    and (p_to           is null or p.created_at::date <= p_to)
    and (p_service_type is null or p.service_type = p_service_type)
    and (p_employee_id  is null or p.assigned_to  = p_employee_id)
  order by p.created_at desc;
$$;

-- ── RPC 5: employee summary stats (for the summary cards) ────────────────────

create or replace function rpc_employee_summary(
  p_employee_id uuid,
  p_from        date default null,
  p_to          date default null
)
returns table(
  total_projects    bigint,
  active_projects   bigint,
  completed_projects bigint,
  ontime_projects   bigint,
  delayed_projects  bigint,
  total_stage_days  numeric,
  tps_days          numeric,
  client_days       numeric,
  fssai_days        numeric,
  total_tasks       bigint,
  ontime_tasks      bigint,
  late_tasks        bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with proj as (
    select p.id, p.status, p.target_date, p.completed_date
    from projects p
    where p.assigned_to = p_employee_id
      and (p_from is null or p.created_at::date >= p_from)
      and (p_to   is null or p.created_at::date <= p_to)
  ),
  stage_days as (
    select
      sum(extract(epoch from (coalesce(st.ended_at,now()) - st.started_at))/86400.0) as total,
      sum(case when st.clock_type='employee'  then extract(epoch from (coalesce(st.ended_at,now()) - st.started_at))/86400.0 else 0 end) as tps,
      sum(case when st.clock_type='client'    then extract(epoch from (coalesce(st.ended_at,now()) - st.started_at))/86400.0 else 0 end) as client,
      sum(case when st.clock_type='authority' then extract(epoch from (coalesce(st.ended_at,now()) - st.started_at))/86400.0 else 0 end) as fssai
    from stage_timeline st
    where st.assigned_to = p_employee_id
      and (p_from is null or st.started_at::date >= p_from)
      and (p_to   is null or st.started_at::date <= p_to)
  ),
  task_stats as (
    select
      count(*)                                                           as total,
      count(*) filter (where status='done' and (due_date is null or completed_at::date <= due_date)) as ontime,
      count(*) filter (where status='done' and due_date is not null and completed_at::date > due_date) as late
    from tasks
    where assigned_to = p_employee_id
      and (p_from is null or created_at::date >= p_from)
      and (p_to   is null or created_at::date <= p_to)
  )
  select
    (select count(*) from proj)                                                   as total_projects,
    (select count(*) from proj where status = 'active')                           as active_projects,
    (select count(*) from proj where status = 'completed')                        as completed_projects,
    (select count(*) from proj where status='completed' and completed_date is not null and target_date is not null and completed_date <= target_date) as ontime_projects,
    (select count(*) from proj where status='completed' and completed_date is not null and target_date is not null and completed_date > target_date) as delayed_projects,
    round((select coalesce(total,0) from stage_days), 2)                          as total_stage_days,
    round((select coalesce(tps,0)   from stage_days), 2)                          as tps_days,
    round((select coalesce(client,0) from stage_days), 2)                         as client_days,
    round((select coalesce(fssai,0)  from stage_days), 2)                         as fssai_days,
    (select total from task_stats)                                                 as total_tasks,
    (select ontime from task_stats)                                                as ontime_tasks,
    (select late from task_stats)                                                  as late_tasks;
$$;
