-- Migration 014: Let any authorised project creator's stages/timeline generate
--
-- BUG: creating a project as an executive (now allowed via the Assigner flag)
-- failed with "new row violates row-level security policy for table 'stages'".
-- The projects INSERT triggers create_stages_from_template() and
-- create_initial_timeline() ran as the CALLER, so their inserts into stages /
-- stage_timeline were subject to those tables' RLS (manager+ only).
--
-- FIX: these triggers only write deterministic, template-derived system rows for
-- the just-created project — make them SECURITY DEFINER so they run as the owner
-- and bypass RLS, regardless of which authorised user created the project.

create or replace function create_stages_from_template()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into stages(project_id, stage_order, stage_name, stage_code, due_date, assigned_to)
  select
    new.id,
    t.stage_order,
    t.stage_name,
    t.stage_code,
    (coalesce(new.start_date, current_date) + cumulative_days::integer)::date,
    new.assigned_to
  from (
    select
      stage_order, stage_name, stage_code,
      sum(default_days) over (order by stage_order) as cumulative_days
    from stage_templates
    where service_type = new.service_type
  ) t;
  return new;
end;
$function$;

create or replace function create_initial_timeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into stage_timeline(project_id, clock_type, note, created_by)
  values (new.id, 'employee', 'Project created', new.created_by);
  return new;
end;
$function$;
