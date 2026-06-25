-- Migration 018: Employee module — operational fields on profiles + a strict-RLS
-- employee_details table for sensitive HR PII (Aadhaar/PAN/addresses/etc.).

-- ── Operational fields on profiles (staff-visible: lists, dropdowns, escalation) ──
alter table profiles
  add column if not exists employee_code  text unique,
  add column if not exists designation    text,   -- Position
  add column if not exists department      text,
  add column if not exists hod_email       text,   -- Head-of-Department mail id
  add column if not exists is_field_staff  boolean not null default false;

-- ── Sensitive HR details (1:1 with profiles, strict RLS) ──────────────────────
create table if not exists employee_details (
  user_id             uuid primary key references profiles(id) on delete cascade,
  father_name         text,
  mother_name         text,
  date_of_birth       date,
  date_of_joining     date,
  higher_qualification text,
  aadhar_no           text,
  pan_no              text,
  personal_email      text,
  home_phone          text,
  permanent_address   text,
  local_address       text,
  emergency_contact   text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table employee_details enable row level security;

-- Visible only to the employee themselves, or HR/admin.
drop policy if exists "employee_details_select" on employee_details;
create policy "employee_details_select" on employee_details
  for select using (user_id = auth.uid() or has_role('super_admin','director','hr'));

drop policy if exists "employee_details_insert" on employee_details;
create policy "employee_details_insert" on employee_details
  for insert with check (user_id = auth.uid() or has_role('super_admin','director','hr'));

drop policy if exists "employee_details_update" on employee_details;
create policy "employee_details_update" on employee_details
  for update using (user_id = auth.uid() or has_role('super_admin','director','hr'));
