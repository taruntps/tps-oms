-- Migration 066: WhatsApp notification triggers for all reminder types
-- Adds: task_assigned, project_completed notification types
--       meta jsonb column on notifications for structured WhatsApp params
--       stage assignment trigger
--       project completion trigger
--       updated project_assigned trigger (replaces migration 054) with meta

-- ── 1. Extend notification_type enum ────────────────────────────────────────
alter type notification_type add value if not exists 'task_assigned';
alter type notification_type add value if not exists 'project_completed';

-- ── 2. Add meta column to notifications ──────────────────────────────────────
alter table notifications add column if not exists meta jsonb not null default '{}';

-- ── 3. Stage assigned → notify assignee ──────────────────────────────────────
create or replace function fn_notify_stage_assigned()
returns trigger language plpgsql security definer as $$
declare
  v_project_name text;
  v_client_name  text;
  v_due_date_fmt text;
begin
  if NEW.assigned_to is not null
     and (OLD.assigned_to is null or OLD.assigned_to <> NEW.assigned_to)
  then
    select p.project_name, c.company_name
    into v_project_name, v_client_name
    from projects p
    join clients c on c.id = p.client_id
    where p.id = NEW.project_id;

    v_due_date_fmt := coalesce(to_char(NEW.due_date, 'DD Mon YYYY'), 'Not set');

    insert into notifications (user_id, type, title, body, reference_id, reference_type, meta)
    values (
      NEW.assigned_to,
      'task_assigned',
      NEW.stage_name || ' assigned to you',
      coalesce(v_project_name, '') || ' — ' || coalesce(v_client_name, '') || ' | Due: ' || v_due_date_fmt,
      NEW.project_id,
      'project',
      jsonb_build_object(
        'stage_name',    NEW.stage_name,
        'project_name',  coalesce(v_project_name, ''),
        'client_name',   coalesce(v_client_name, ''),
        'due_date',      v_due_date_fmt
      )
    )
    on conflict do nothing;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_stage_assigned on stages;
create trigger trg_notify_stage_assigned
  after insert or update of assigned_to on stages
  for each row execute function fn_notify_stage_assigned();

-- ── 4. Project completed → notify assignee + manager ─────────────────────────
create or replace function fn_notify_project_completed()
returns trigger language plpgsql security definer as $$
declare
  v_client_name  text;
  v_date_fmt     text;
begin
  if NEW.status = 'completed'
     and (OLD.status is null or OLD.status <> 'completed')
  then
    select c.company_name into v_client_name
    from clients c where c.id = NEW.client_id;

    v_date_fmt := to_char(now(), 'DD Mon YYYY');

    if NEW.assigned_to is not null then
      insert into notifications (user_id, type, title, body, reference_id, reference_type, meta)
      values (
        NEW.assigned_to,
        'project_completed',
        NEW.project_name || ' completed',
        NEW.project_code || ' for ' || coalesce(v_client_name, '') || ' has been marked as completed.',
        NEW.id,
        'project',
        jsonb_build_object(
          'project_name', NEW.project_name,
          'project_code', NEW.project_code,
          'client_name',  coalesce(v_client_name, ''),
          'date',         v_date_fmt
        )
      )
      on conflict do nothing;
    end if;

    if NEW.manager_id is not null and NEW.manager_id is distinct from NEW.assigned_to then
      insert into notifications (user_id, type, title, body, reference_id, reference_type, meta)
      values (
        NEW.manager_id,
        'project_completed',
        NEW.project_name || ' completed',
        NEW.project_code || ' for ' || coalesce(v_client_name, '') || ' has been marked as completed.',
        NEW.id,
        'project',
        jsonb_build_object(
          'project_name', NEW.project_name,
          'project_code', NEW.project_code,
          'client_name',  coalesce(v_client_name, ''),
          'date',         v_date_fmt
        )
      )
      on conflict do nothing;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_project_completed on projects;
create trigger trg_notify_project_completed
  after update of status on projects
  for each row execute function fn_notify_project_completed();

-- ── 5. Replace project_assigned trigger (migration 054) with meta-aware version
create or replace function notify_project_created()
returns trigger language plpgsql security definer as $$
declare
  v_client_name text;
begin
  select c.company_name into v_client_name
  from clients c where c.id = NEW.client_id;

  if NEW.assigned_to is not null then
    insert into notifications (user_id, type, title, body, reference_id, reference_type, meta)
    values (
      NEW.assigned_to,
      'project_assigned',
      'New project assigned to you',
      NEW.project_code || coalesce(' — ' || NEW.service_type, '') || ' has been created and assigned to you.',
      NEW.id,
      'project',
      jsonb_build_object(
        'project_name', NEW.project_name,
        'project_code', NEW.project_code,
        'client_name',  coalesce(v_client_name, ''),
        'service_type', coalesce(NEW.service_type, '')
      )
    )
    on conflict do nothing;
  end if;

  if NEW.manager_id is not null and NEW.manager_id is distinct from NEW.assigned_to then
    insert into notifications (user_id, type, title, body, reference_id, reference_type, meta)
    values (
      NEW.manager_id,
      'project_assigned',
      'New project under your management',
      NEW.project_code || coalesce(' — ' || NEW.service_type, '') || ' has been created.',
      NEW.id,
      'project',
      jsonb_build_object(
        'project_name', NEW.project_name,
        'project_code', NEW.project_code,
        'client_name',  coalesce(v_client_name, ''),
        'service_type', coalesce(NEW.service_type, '')
      )
    )
    on conflict do nothing;
  end if;

  return NEW;
end;
$$;
-- trigger already exists from migration 054 — function replacement is enough
