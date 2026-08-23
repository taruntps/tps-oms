-- 127 — All-channel notifications.
-- (a) Add an email tracker so the dispatcher can send an email per notification
--     (parallel to whatsapp_sent_at), and backfill existing rows so the new email
--     leg only processes notifications created from here on (no history flood).
-- (b) Make task-assigned also notify the project's manager (not just the assignee),
--     so bell + WhatsApp + email all reach the manager too.

-- (a) Email tracker + backfill --------------------------------------------------
alter table public.notifications add column if not exists email_sent_at timestamptz;

update public.notifications
   set email_sent_at = coalesce(created_at, now())
 where email_sent_at is null;

-- (b) task_assigned → assignee + project manager --------------------------------
create or replace function public.notify_task_assigned()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_project text; v_due text; v_manager uuid; v_assignee_name text;
begin
  if new.assigned_to is null or new.assigned_to = new.assigned_by then
    return new;
  end if;

  select project_name, manager_id into v_project, v_manager
    from public.projects where id = new.project_id;
  v_due := coalesce(to_char(new.due_date, 'DD Mon YYYY'), 'Not set');

  -- Assignee
  insert into public.notifications (user_id, type, title, body, reference_id, reference_type, meta)
  values (
    new.assigned_to, 'task_assigned', new.title,
    'A task has been assigned to you', new.id, 'task',
    jsonb_build_object('project_name', coalesce(v_project, '—'), 'due_date', v_due)
  );

  -- Project manager (when set, and not already the assignee or the assigner)
  if v_manager is not null
     and v_manager <> new.assigned_to
     and (new.assigned_by is null or v_manager <> new.assigned_by) then
    select name into v_assignee_name from public.profiles where id = new.assigned_to;
    insert into public.notifications (user_id, type, title, body, reference_id, reference_type, meta)
    values (
      v_manager, 'task_assigned', new.title,
      'A task in your project was assigned to ' || coalesce(v_assignee_name, 'a team member'),
      new.id, 'task',
      jsonb_build_object('project_name', coalesce(v_project, '—'), 'due_date', v_due)
    );
  end if;

  return new;
end $function$;
