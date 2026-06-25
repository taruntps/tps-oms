-- Migration 029: task workflow — comments, extension requests, role-based locking.
--
-- Rules (confirmed):
--   • Core fields (title/details/assignee/priority/due/project/client) editable
--     ONLY by the assigner (creator) or an admin (super_admin/director).
--   • The assignee may ONLY change status, add comments, and request an extension.
--   • Marking Done locks the task; only the assigner/admin can reopen it.
--   • Extension: assignee requests N days + reason → assigner/admin approves →
--     due date auto-extends. Emails are sent by the urgent-alerts function.

-- ── Comments ──────────────────────────────────────────────────────────────
create table if not exists task_comments (
  id         uuid primary key default uuid_generate_v4(),
  task_id    uuid not null references tasks(id) on delete cascade,
  author_id  uuid references profiles(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists task_comments_task_idx on task_comments(task_id);

alter table task_comments enable row level security;

-- visible to anyone who can see the parent task
drop policy if exists task_comments_select on task_comments;
create policy task_comments_select on task_comments for select to authenticated
using (exists (select 1 from tasks t where t.id = task_id
  and (t.assigned_to = auth.uid() or t.assigned_by = auth.uid() or has_role('super_admin','director','manager'))));

drop policy if exists task_comments_insert on task_comments;
create policy task_comments_insert on task_comments for insert to authenticated
with check (author_id = auth.uid() and exists (select 1 from tasks t where t.id = task_id
  and (t.assigned_to = auth.uid() or t.assigned_by = auth.uid() or has_role('super_admin','director','manager'))));

-- ── Extension requests ────────────────────────────────────────────────────
create table if not exists task_extension_requests (
  id           uuid primary key default uuid_generate_v4(),
  task_id      uuid not null references tasks(id) on delete cascade,
  requested_by uuid references profiles(id) on delete set null,
  extra_days   int  not null check (extra_days between 1 and 365),
  reason       text,
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by   uuid references profiles(id) on delete set null,
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists task_ext_task_idx on task_extension_requests(task_id);

alter table task_extension_requests enable row level security;
-- read only for users who can see the task; all writes go through RPCs (definer)
drop policy if exists task_ext_select on task_extension_requests;
create policy task_ext_select on task_extension_requests for select to authenticated
using (exists (select 1 from tasks t where t.id = task_id
  and (t.assigned_to = auth.uid() or t.assigned_by = auth.uid() or has_role('super_admin','director','manager'))));

-- ── Role-based edit / done-lock guard ───────────────────────────────────────
create or replace function tasks_guard_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_admin boolean; v_assigner boolean; v_assignee boolean;
begin
  if auth.uid() is null then return new; end if;  -- service role / cron: trusted

  v_admin    := has_role('super_admin','director');
  v_assigner := (old.assigned_by = auth.uid());
  v_assignee := (old.assigned_to = auth.uid());

  if not (v_admin or v_assigner or v_assignee) then
    raise exception 'You do not have permission to edit this task.';
  end if;

  -- Done is locked: only assigner/admin may change anything (e.g. reopen)
  if old.status = 'done' and not (v_admin or v_assigner) then
    raise exception 'This task is completed and locked.';
  end if;

  -- Assignee (and not also assigner/admin) may change ONLY the status
  if v_assignee and not (v_assigner or v_admin) then
    if (new.title, new.description, new.assigned_to, new.assigned_by, new.project_id, new.client_id, new.priority, new.due_date)
       is distinct from
       (old.title, old.description, old.assigned_to, old.assigned_by, old.project_id, old.client_id, old.priority, old.due_date) then
      raise exception 'You can only change the status of a task assigned to you.';
    end if;
    if new.status = 'cancelled' then
      raise exception 'Only the assigner can cancel a task.';
    end if;
  end if;

  return new;
end;
$$;
drop trigger if exists tasks_guard_update_trg on tasks;
create trigger tasks_guard_update_trg before update on tasks
  for each row execute procedure tasks_guard_update();

-- ── Extension RPCs ──────────────────────────────────────────────────────────
create or replace function request_task_extension(p_task_id uuid, p_days int, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_task tasks;
begin
  select * into v_task from tasks where id = p_task_id;
  if v_task.id is null then raise exception 'Task not found'; end if;
  if v_task.assigned_to <> auth.uid() then raise exception 'Only the assignee can request an extension'; end if;
  if v_task.status in ('done','cancelled') then raise exception 'This task is closed'; end if;
  if p_days < 1 or p_days > 365 then raise exception 'Extension must be 1-365 days'; end if;
  if exists (select 1 from task_extension_requests where task_id = p_task_id and status = 'pending') then
    raise exception 'There is already a pending extension request on this task';
  end if;
  insert into task_extension_requests(task_id, requested_by, extra_days, reason)
    values (p_task_id, auth.uid(), p_days, nullif(trim(coalesce(p_reason,'')), ''))
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function decide_task_extension(p_request_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_req task_extension_requests; v_task tasks;
begin
  select * into v_req from task_extension_requests where id = p_request_id;
  if v_req.id is null then raise exception 'Request not found'; end if;
  select * into v_task from tasks where id = v_req.task_id;
  if not (has_role('super_admin','director') or v_task.assigned_by = auth.uid()) then
    raise exception 'Only the assigner or an admin can decide this request';
  end if;
  if v_req.status <> 'pending' then raise exception 'This request was already decided'; end if;

  update task_extension_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        decided_by = auth.uid(), decided_at = now()
    where id = p_request_id;

  if p_approve then
    update tasks
      set due_date = coalesce(due_date, (now() at time zone 'Asia/Kolkata')::date) + v_req.extra_days
      where id = v_req.task_id;
  end if;
end;
$$;
