-- Migration 035: generate per-product Artwork stage tracks.
-- Called after products are inserted for a multi-product Artwork project.
create or replace function generate_artwork_product_stages(p_project_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_start date; v_assigned uuid; r record;
begin
  select start_date, assigned_to into v_start, v_assigned from projects where id = p_project_id;
  delete from stages where project_id = p_project_id;   -- drop the single auto-generated track
  for r in select id from project_products where project_id = p_project_id order by product_no loop
    insert into stages (project_id, product_id, stage_order, stage_name, stage_code, stage_kind,
                        is_skippable, active_clock, doc_status, due_date, assigned_to)
    select p_project_id, r.id, t.stage_order, t.stage_name, t.stage_code, t.stage_kind, t.is_skippable,
      coalesce(t.clock_action,'employee')::clock_type,
      case when t.stage_kind = 'doc_collection' then 'partial' else null end,
      case when t.default_days is null then null else fn_add_working_days(coalesce(v_start, current_date), t.cum_days::int) end,
      v_assigned
    from (
      select stage_order, stage_name, stage_code, stage_kind, is_skippable, clock_action, default_days,
             sum(default_days) over (order by stage_order) as cum_days
      from stage_templates where service_type = 'Artwork'
    ) t;
  end loop;
end; $$;
