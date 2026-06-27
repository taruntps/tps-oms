-- Migration 033: Phase 2b/3 support — flexible per-stage capture + FSSAI status + query round response date.
alter table stages add column if not exists meta jsonb not null default '{}'::jsonb;
alter table stages add column if not exists fssai_status text;  -- status_fssai stages
alter table authority_queries add column if not exists response_submitted_date date;
alter table authority_queries add column if not exists round_no smallint;
