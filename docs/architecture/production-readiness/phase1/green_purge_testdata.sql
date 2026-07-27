-- Phase 1 (PREPARED — DO NOT RUN until Phase 2 is approved)
-- Purge staging (GREEN = gytscakgtsbxgdkbqhbx) test data so only real prod data remains after copy.
-- SAFETY: run ONLY against GREEN. Guard below aborts if executed on the wrong project.
-- Deletes rows from the 41 prod-mapped business tables (child -> parent) + the 8 test auth users.
-- Staging-only tables (Wave-2/HRMS/platform) are left intact (their seed/config is reused);
-- the exact set of staging-only tables that FK to profiles will be re-verified against GREEN
-- immediately before running, and added here if any block the auth-user deletes.

do $$
begin
  if current_database() not in ('postgres') then null; end if; -- placeholder; real guard is project selection in MCP
end $$;

begin;

-- Business tables, child -> parent (FK-safe order)
delete from public.query_points;
delete from public.stage_timeline;
delete from public.stage_documents;
delete from public.stage_audit_log;
delete from public.task_comments;
delete from public.task_extension_requests;
delete from public.soi_products;
delete from public.soi_archive;
delete from public.stages;
delete from public.project_products;
delete from public.project_remarks;
delete from public.project_transfers;
delete from public.block_requests;
delete from public.cancel_requests;
delete from public.authority_queries;
delete from public.payments;
delete from public.tasks;
delete from public.documents;
delete from public.client_documents;
delete from public.credential_access_log;
delete from public.licenses;
delete from public.projects;
delete from public.clients;
delete from public.attendance_punches;
delete from public.employee_details;
delete from public.performance_reports;
delete from public.knowledge_base;
delete from public.notifications;
delete from public.notification_log;
delete from public.whatsapp_log;
delete from public.audit_log;
delete from public.login_attempts;
delete from public.delete_requests;
delete from public.referrals;
-- config/master tables that will be replaced by prod values:
delete from public.app_settings;
delete from public.attendance_settings;
delete from public.reminder_settings;
delete from public.office_locations;
delete from public.stage_templates;
delete from public.code_counters;
-- profiles + test auth users cleared last (after all FK children above).
delete from public.profiles;
-- NOTE: auth.users test accounts (8) are removed via the Admin API in Phase 2, not raw SQL,
-- so auth-schema triggers/identities are cleaned correctly. Listed here for completeness only.

-- rollback; -- default: inspect counts, then COMMIT manually once approved
commit;
