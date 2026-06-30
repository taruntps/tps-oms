-- Migration 058: Fix code_counters RLS for project/task creation
--
-- Problem: generate_project_code and generate_task_code are BEFORE INSERT triggers
-- that write to code_counters. Without SECURITY DEFINER they run with the
-- calling user's privileges — executives and managers have no RLS policy
-- on code_counters, so the INSERT/UPDATE is blocked.
--
-- Fix: Recreate both trigger functions with SECURITY DEFINER so they always
-- execute with the function owner's privileges (postgres/service role),
-- regardless of who inserts the project/task.

create or replace function generate_project_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_next integer;
begin
  if new.project_code is null or new.project_code = '' then
    insert into code_counters (scope, last_value)
    values ('project-' || v_year, 1)
    on conflict (scope) do update
      set last_value = code_counters.last_value + 1
    returning last_value into v_next;

    new.project_code := 'TPS-P-' || v_year || '-' || lpad(v_next::text, 4, '0');
  end if;
  return new;
end;
$$;

create or replace function generate_task_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_next integer;
begin
  if new.task_code is null or new.task_code = '' then
    insert into code_counters (scope, last_value)
    values ('task-' || v_year, 1)
    on conflict (scope) do update
      set last_value = code_counters.last_value + 1
    returning last_value into v_next;

    new.task_code := 'TPS-T-' || v_year || '-' || lpad(v_next::text, 4, '0');
  end if;
  return new;
end;
$$;
