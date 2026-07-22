-- Migration 091 — M3 Leave: attachment support (additive). Applied to staging.
-- Proof documents for leave requests (e.g. SL medical certificate where
-- hr_leave_types.requires_proof = true). Reuses Document Management via document_id;
-- attachment_url for a direct/stored link.
alter table public.hr_leave_requests add column if not exists document_id uuid;
alter table public.hr_leave_requests add column if not exists attachment_url text;
