-- Migration 063: Per-employee report permissions
-- Adds a jsonb array column to profiles so super_admin / director can grant
-- specific report tabs (pending_payments, queries, govt_fees) to individual employees.
-- super_admin and director always see all tabs regardless of this column.

alter table profiles
  add column if not exists report_permissions jsonb not null default '[]'::jsonb;
