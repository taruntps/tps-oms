-- Migration 013: Fix staff visibility + unblock_project column bug
--
-- BUG 1 (empty dropdowns): profiles_select only let a user see THEIR OWN row
-- unless they were manager+/hr/auditor. So executives (e.g. Priya) saw no
-- colleagues — the Transfer "Select staff" and New Project "Manager" dropdowns
-- were empty, blocking transfers and project creation.
-- FIX: any authenticated staff member can read profiles (all are internal staff;
-- the app only surfaces id/name/role in pickers).
--
-- BUG 2 (Unblock fails: "column \"note\" does not exist"): unblock_project()
-- updated block_requests.note, but the column is rejection_note.

-- ── 1. Staff visibility ──────────────────────────────────────────────────────
drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles
  for select using (auth.uid() is not null);

-- ── 2. unblock_project: correct column name ──────────────────────────────────
create or replace function unblock_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update projects
     set is_blocked = false, block_type = null, block_reason = null,
         block_started_at = null, block_expires_at = null
   where id = p_project_id;

  update block_requests
     set approved        = false,
         rejection_note  = coalesce(rejection_note, 'Manually unblocked'),
         reviewed_at     = now()
   where project_id = p_project_id and approved is null;
end;
$$;
