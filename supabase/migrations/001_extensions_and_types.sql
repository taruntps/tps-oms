-- ============================================================
-- TPS-OMS Migration 001: Extensions & Enum Types
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_cron";
create extension if not exists "supabase_vault";
create extension if not exists "moddatetime";

-- ============================================================
-- ENUM TYPES
-- ============================================================

create type user_role as enum (
  'super_admin',
  'director',
  'manager',
  'executive',
  'accounts',
  'hr',
  'auditor'
);

create type clock_type as enum (
  'employee',   -- 🟢 green  — work in TPS hands
  'client',     -- 🟡 amber  — waiting on client
  'authority'   -- 🔵 blue   — waiting on government authority
);

create type block_type as enum (
  'document_pending',
  'client_unresponsive',
  'authority_delay',
  'payment_pending',
  'internal_review',
  'other'
);

create type project_status as enum (
  'active',
  'on_hold',
  'completed',
  'cancelled',
  'archived'
);

create type stage_status as enum (
  'pending',
  'in_progress',
  'blocked',
  'completed',
  'skipped'
);

create type payment_status as enum (
  'pending',
  'partial',
  'paid',
  'overdue',
  'refunded'
);

create type document_type as enum (
  'client_upload',
  'tps_prepared',
  'authority_issued',
  'soi',
  'invoice',
  'other'
);

create type query_type as enum (
  'deficiency_letter',
  'additional_info',
  'inspection_notice',
  'show_cause',
  'other'
);

create type notification_type as enum (
  'stage_overdue',
  'expiry_warning',
  'block_request',
  'block_approved',
  'payment_overdue',
  'query_received',
  'license_expiring',
  'project_assigned'
);
