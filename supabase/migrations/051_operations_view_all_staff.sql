-- Migration 051: open the Operations overview to all staff.
-- Decision: every employee may VIEW all active projects (org-wide pipeline) so
-- they can filter the Operations board. Read-only widening; all WRITE policies
-- (insert/update/assign) stay role-gated and unchanged.
--
-- Projects + stages must both be readable, because the per-project clock on the
-- Operations cards is derived from each project's stages.

-- ── Projects: any authenticated staff can read ───────────────────────────────
drop policy if exists "projects_select" on projects;
create policy "projects_select" on projects
  for select using (auth.uid() is not null);

-- ── Stages: any authenticated staff can read (needed for clock computation) ──
drop policy if exists "stages_select" on stages;
create policy "stages_select" on stages
  for select using (auth.uid() is not null);

-- ── Clients: include hr so company names render for everyone on Operations ──
drop policy if exists "clients_select_all_staff" on clients;
create policy "clients_select_all_staff" on clients
  for select using (has_role('super_admin','director','manager','executive','accounts','hr','auditor'));
