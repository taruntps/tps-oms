-- Migration 038: Document Collection stages now start at 'pending' (nothing received).
create or replace function create_stages_from_template()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into stages (project_id, stage_order, stage_name, stage_code, stage_kind,
                       is_skippable, active_clock, doc_status, due_date, assigned_to)
  select
    new.id, t.stage_order, t.stage_name, t.stage_code, t.stage_kind, t.is_skippable,
    coalesce(t.clock_action,'employee')::clock_type,
    case when t.stage_kind = 'doc_collection' then 'pending' else null end,
    case when t.default_days is null then null
         else fn_add_working_days(coalesce(new.start_date, current_date), t.cum_days::int) end,
    new.assigned_to
  from (
    select stage_order, stage_name, stage_code, stage_kind, is_skippable, clock_action, default_days,
           sum(default_days) over (order by stage_order) as cum_days
    from stage_templates
    where service_type = new.service_type
  ) t;
  return new;
end; $$;
