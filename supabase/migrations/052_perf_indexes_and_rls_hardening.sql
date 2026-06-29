-- Migration 052: Performance indexes + RLS hardening
-- Findings from the 2026-06-29 engineering review.
-- Safe to apply to live DB — all CREATE INDEX CONCURRENTLY, no table locks.

-- ── 1. Missing performance indexes ──────────────────────────────────────────

-- projects.target_date — every list view ORDER BY this column (full table scan)
CREATE INDEX CONCURRENTLY IF NOT EXISTS projects_target_date_idx
  ON projects(target_date);

-- projects.created_at — ORDER BY on all list queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS projects_created_at_idx
  ON projects(created_at DESC);

-- projects.payment_status — usePendingPayments filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS projects_payment_status_idx
  ON projects(payment_status);

-- projects.manager_id — used in RLS WHERE clauses on every manager SELECT
CREATE INDEX CONCURRENTLY IF NOT EXISTS projects_manager_id_idx
  ON projects(manager_id);

-- stages compound index — fn_sync_project_completion trigger runs on every stage
-- UPDATE and scans all stages for a project filtered by status
CREATE INDEX CONCURRENTLY IF NOT EXISTS stages_project_status_idx
  ON stages(project_id, status);

-- stages.active_clock — fetched in every project list for clockBucket()
CREATE INDEX CONCURRENTLY IF NOT EXISTS stages_active_clock_idx
  ON stages(active_clock);

-- stages.assigned_to — FK column in RLS policy (or assigned_to = auth.uid())
CREATE INDEX CONCURRENTLY IF NOT EXISTS stages_assigned_to_idx
  ON stages(assigned_to);

-- stages.due_date — cron job for overdue stage alerts
CREATE INDEX CONCURRENTLY IF NOT EXISTS stages_due_date_idx
  ON stages(due_date) WHERE status NOT IN ('completed', 'skipped', 'cancelled');

-- payments.client_id — FK with no index
CREATE INDEX CONCURRENTLY IF NOT EXISTS payments_client_id_idx
  ON payments(client_id);

-- stage_timeline.stage_id — FK with no index (only project_id index existed)
CREATE INDEX CONCURRENTLY IF NOT EXISTS stage_timeline_stage_id_idx
  ON stage_timeline(stage_id);

-- profiles.is_active — used in resolve_login_email, admin_create_user, etc.
CREATE INDEX CONCURRENTLY IF NOT EXISTS profiles_is_active_idx
  ON profiles(is_active) WHERE is_active = true;

-- notifications.created_at — for ordered notification fetches
CREATE INDEX CONCURRENTLY IF NOT EXISTS notifications_created_at_idx
  ON notifications(created_at DESC);

-- ── 2. RLS: enable on unprotected tables ────────────────────────────────────

-- code_counters had NO RLS — any authenticated user could zero project code counters
ALTER TABLE code_counters ENABLE ROW LEVEL SECURITY;
-- Only super_admin / director can read or write code counters
CREATE POLICY "code_counters_select_admin" ON code_counters
  FOR SELECT USING (auth_role() IN ('super_admin', 'director'));
CREATE POLICY "code_counters_all_admin" ON code_counters
  FOR ALL USING (auth_role() IN ('super_admin', 'director'));

-- stage_templates had NO RLS — any authenticated user could delete all templates
ALTER TABLE stage_templates ENABLE ROW LEVEL SECURITY;
-- All staff can read templates (needed for project creation), only admins can mutate
CREATE POLICY "stage_templates_select_authenticated" ON stage_templates
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "stage_templates_all_admin" ON stage_templates
  FOR ALL USING (auth_role() IN ('super_admin', 'director', 'manager'));

-- ── 3. RLS: tighten overly-permissive policies ──────────────────────────────

-- soi_products: currently USING (true) with no auth check at all
DROP POLICY IF EXISTS "soi_products_select" ON soi_products;
DROP POLICY IF EXISTS "soi_products_all" ON soi_products;
CREATE POLICY "soi_products_select_authenticated" ON soi_products
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "soi_products_write_manager" ON soi_products
  FOR ALL USING (auth_role() IN ('super_admin', 'director', 'manager', 'executive', 'accounts'));

-- stage_documents: currently any authenticated user can DELETE stage documents
DROP POLICY IF EXISTS "stage_documents_all_authenticated" ON stage_documents;
CREATE POLICY "stage_documents_select_authenticated" ON stage_documents
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "stage_documents_write_staff" ON stage_documents
  FOR ALL USING (auth_role() IN ('super_admin', 'director', 'manager', 'executive', 'accounts'));
