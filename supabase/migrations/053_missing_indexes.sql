-- Migration 053: Additional missing indexes
-- Complements 052_perf_indexes_and_rls_hardening which already added:
--   projects_target_date_idx, projects_created_at_idx, projects_payment_status_idx (non-partial),
--   projects_manager_id_idx, stages_active_clock_idx, stages_assigned_to_idx, stages_due_date_idx,
--   profiles_is_active_idx, payments_client_id_idx, stage_timeline_stage_id_idx
-- Only indexes confirmed absent from all 52 prior migrations are added here.

-- ── projects ──────────────────────────────────────────────────────────────────

-- Compound used by useDashboard / useProjects ORDER BY status, active_clock
CREATE INDEX IF NOT EXISTS projects_status_clock_idx
  ON projects(status, active_clock);

-- Partial index for blocked-project alerts (is_blocked = true is a tiny fraction of rows)
CREATE INDEX IF NOT EXISTS projects_is_blocked_idx
  ON projects(is_blocked) WHERE is_blocked = true;

-- ── stages ────────────────────────────────────────────────────────────────────

-- stages.status used in fn_sync_project_completion trigger and stage list queries
CREATE INDEX IF NOT EXISTS stages_status_idx
  ON stages(status);

-- ── profiles ─────────────────────────────────────────────────────────────────

-- profiles.role used in RLS auth_role() helper and admin user-list queries
CREATE INDEX IF NOT EXISTS profiles_role_idx
  ON profiles(role);
