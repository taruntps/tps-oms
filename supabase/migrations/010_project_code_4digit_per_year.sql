-- Migration 010: Project code → TPS-YYYY-NNNN (4-digit, resets per year)
--
-- The original generate_project_code() (migration 002) used a single continuous
-- sequence (project_seq) and 3-digit padding → TPS-2026-001. The spec calls for
-- TPS-2026-0001 with the counter restarting each year. We switch to a per-year
-- counter table so numbering resets on 1 Jan automatically.
--
-- Query codes (authority_queries.query_code) derive from project_code, so they
-- become TPS-2026-0001-Q1 with no change to generate_query_code().

create table if not exists code_counters (
  scope      text primary key,        -- e.g. 'project-2026'
  last_value integer not null default 0
);

-- Seed per-year counters from any existing project codes so new codes never
-- collide with trial data already present.
insert into code_counters (scope, last_value)
select 'project-' || coalesce((regexp_match(p.project_code, '^TPS-(\d{4})-'))[1],
                               to_char(p.created_at, 'YYYY')),
       max((regexp_match(p.project_code, '-(\d+)$'))[1]::int)
from projects p
where p.project_code ~ '^TPS-\d{4}-\d+$'
group by 1
on conflict (scope) do update
  set last_value = greatest(code_counters.last_value, excluded.last_value);

create or replace function generate_project_code()
returns trigger
language plpgsql
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

    new.project_code := 'TPS-' || v_year || '-' || lpad(v_next::text, 4, '0');
  end if;
  return new;
end;
$$;

-- Trigger already exists from migration 002 (projects_code_gen → generate_project_code).
-- Re-create defensively in case it was dropped.
drop trigger if exists projects_code_gen on projects;
create trigger projects_code_gen
  before insert on projects
  for each row when (new.project_code is null or new.project_code = '')
  execute procedure generate_project_code();
