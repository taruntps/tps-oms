-- Migration 064: Allow executive role to update any stage
-- Previously stages_update only allowed super_admin/director/manager OR assigned_to = auth.uid()
-- Executives who are not the stage assignee (e.g. helping on another employee's project) were blocked.
-- Fix: add 'executive' to the role check so any executive can update stage fields.

drop policy if exists "stages_update" on stages;

create policy "stages_update" on stages for update
  using (
    has_role('super_admin', 'director', 'manager', 'executive')
    or assigned_to = auth.uid()
  );
