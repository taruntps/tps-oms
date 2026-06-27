-- Migration 030: add 'not_required' to stage_status (skipped-optional stages count
-- as done so projects reach 100% instead of stalling at e.g. 9/10).
-- Must be its own migration: ALTER TYPE ADD VALUE cannot run with dependent DDL in one txn.
alter type stage_status add value if not exists 'not_required';
