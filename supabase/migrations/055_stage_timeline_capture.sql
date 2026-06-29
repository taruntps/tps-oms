-- Migration 055: Auto-capture stage timeline with clock + assignee tracking
--
-- Adds:
--   1. assigned_to column on stage_timeline (who held the project at this moment)
--   2. assigned_at on projects (when the project was first / last assigned)
--   3. Trigger: stage moves in_progress  → insert open timeline row
--   4. Trigger: stage active_clock changes → close current row, open new one
--   5. Trigger: stage moves completed/skipped/not_applicable → close open row
--   6. Trigger: projects.assigned_to changes → stamp assigned_at
--
-- All triggers are SECURITY DEFINER so they run regardless of RLS caller.

-- ── 1. New columns ───────────────────────────────────────────────────────────

alter table stage_timeline
  add column if not exists assigned_to uuid references profiles(id),
  add column if not exists stage_code  text;  -- denormalised for fast reporting

alter table projects
  add column if not exists assigned_at timestamptz;

-- Back-fill assigned_at for existing projects (use created_at as best proxy)
update projects set assigned_at = created_at where assigned_to is not null and assigned_at is null;

-- Index for employee-centric report queries
create index if not exists stage_timeline_assignee_idx on stage_timeline(assigned_to);
create index if not exists stage_timeline_stage_idx    on stage_timeline(stage_id);
create index if not exists projects_assigned_at_idx    on projects(assigned_at);

-- ── 2. Helper: close any open stage_timeline row for a stage ─────────────────

create or replace function close_open_timeline_row(p_stage_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update stage_timeline
  set ended_at = now()
  where stage_id = p_stage_id
    and ended_at is null;
end;
$$;

-- ── 3. Main trigger function: fires AFTER UPDATE on stages ───────────────────
--
-- Cases handled:
--   A) status: pending → in_progress         → open a new timeline row
--   B) active_clock changes (while in_progress) → close old row, open new row
--   C) status: in_progress → completed / skipped / not_applicable → close row

create or replace function trg_stage_timeline_capture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignee uuid;
begin
  -- Resolve current assignee: stage-level first, fall back to project-level
  select coalesce(s.assigned_to, p.assigned_to)
  into v_assignee
  from stages s
  join projects p on p.id = s.project_id
  where s.id = new.id;

  -- ── Case A: stage just became in_progress ──────────────────────────────
  if old.status <> 'in_progress' and new.status = 'in_progress' then
    -- Close any stale open row (defensive)
    perform close_open_timeline_row(new.id);
    -- Open fresh row
    insert into stage_timeline (project_id, stage_id, stage_code, clock_type, started_at, assigned_to)
    values (new.project_id, new.id, new.stage_code, new.active_clock, now(), v_assignee);
    return new;
  end if;

  -- ── Case B: clock switched while stage is in_progress ──────────────────
  if new.status = 'in_progress'
     and old.active_clock is distinct from new.active_clock then
    -- Close the current open row
    perform close_open_timeline_row(new.id);
    -- Open new row with updated clock
    insert into stage_timeline (project_id, stage_id, stage_code, clock_type, started_at, assigned_to)
    values (new.project_id, new.id, new.stage_code, new.active_clock, now(), v_assignee);
    return new;
  end if;

  -- ── Case C: stage completed / skipped / not_applicable ─────────────────
  if old.status = 'in_progress'
     and new.status in ('completed', 'skipped', 'not_applicable') then
    perform close_open_timeline_row(new.id);
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_stage_timeline_capture on stages;
create trigger trg_stage_timeline_capture
  after update on stages
  for each row
  execute function trg_stage_timeline_capture();

-- ── 4. Trigger: project assigned_to changes → stamp assigned_at ──────────────
--    Also re-stamps on every transfer so we know the latest assignment time.
--    The first assignment is preserved via back-fill above.

create or replace function trg_project_assigned_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    new.assigned_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_project_assigned_at on projects;
create trigger trg_project_assigned_at
  before update on projects
  for each row
  execute function trg_project_assigned_at();

-- ── 5. Trigger: also capture when assignee changes mid in_progress stage ─────
--    If a project is transferred while a stage is in_progress, close old row
--    and open a new one with the new assignee (same clock).

create or replace function trg_stage_timeline_reassign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    -- Find all in_progress stages for this project
    for r in
      select id, project_id, stage_code, active_clock
      from stages
      where project_id = new.id and status = 'in_progress'
    loop
      -- Close old assignee's row
      perform close_open_timeline_row(r.id);
      -- Open new row under new assignee
      insert into stage_timeline (project_id, stage_id, stage_code, clock_type, started_at, assigned_to)
      values (new.id, r.id, r.stage_code, r.active_clock, now(), new.assigned_to);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stage_timeline_reassign on projects;
create trigger trg_stage_timeline_reassign
  after update on projects
  for each row
  execute function trg_stage_timeline_reassign();

-- ── 6. RLS: allow all active staff to read stage_timeline (for reports) ───────

drop policy if exists "stage_timeline_select" on stage_timeline;
create policy "stage_timeline_select" on stage_timeline
  for select using (
    exists (
      select 1 from profiles
      where id = auth.uid() and is_active = true
    )
  );
