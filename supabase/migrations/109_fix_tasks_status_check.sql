-- 109 — Fix tasks_status_check drift. The app uses 'pending' as the open state
-- (TaskModal defaults new tasks to 'pending'; TasksPage filters on it), but the
-- production constraint only allowed open/in_progress/done/cancelled, so every
-- task insert failed. Applied live via apply_migration; repo record.
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status = any (array['pending', 'open', 'in_progress', 'done', 'cancelled']));
