-- 111 — WhatsApp (+ in-app) for manual task assignment. On task insert, queue a
-- 'task_assigned' notification for the assignee; notify-dispatch then sends the
-- tps_task_assigned template. Email already fires via urgent-alerts. Applied live
-- via apply_migration; repo record.
create or replace function public.notify_task_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_project text; v_due text;
begin
  if new.assigned_to is null or new.assigned_to = new.assigned_by then
    return new;
  end if;
  select project_name into v_project from public.projects where id = new.project_id;
  v_due := coalesce(to_char(new.due_date, 'DD Mon YYYY'), 'Not set');
  insert into public.notifications (user_id, type, title, body, reference_id, reference_type, meta)
  values (
    new.assigned_to, 'task_assigned', new.title,
    'A task has been assigned to you', new.id, 'task',
    jsonb_build_object('project_name', coalesce(v_project, '—'), 'due_date', v_due)
  );
  return new;
end $$;

drop trigger if exists trg_notify_task_assigned on public.tasks;
create trigger trg_notify_task_assigned
  after insert on public.tasks
  for each row execute function public.notify_task_assigned();
