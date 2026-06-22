-- ============================================================
-- TPS-OMS Migration 002: Core Tables
-- ============================================================

-- ============================================================
-- 1. PROFILES (extends auth.users)
-- ============================================================
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  name         text not null,
  email        text not null unique,
  phone        text,
  role         user_role not null default 'executive',
  avatar_url   text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on profiles
  for each row execute procedure moddatetime(updated_at);

-- ============================================================
-- 2. CLIENTS
-- ============================================================
create table clients (
  id                  uuid primary key default uuid_generate_v4(),
  company_name        text not null,
  trade_name          text,
  contact_person      text not null,
  contact_phone       text not null,
  contact_email       text,
  address             text,
  city                text,
  state               text not null default 'Punjab',
  gstin               text,
  pan                 text,
  fssai_central_ref   text,   -- FSSAI central licence reference
  notes               text,
  is_active           boolean not null default true,
  created_by          uuid references profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger clients_updated_at
  before update on clients
  for each row execute procedure moddatetime(updated_at);

-- ============================================================
-- 3. LICENSES (FSSAI licences per client)
-- ============================================================
create table licenses (
  id                uuid primary key default uuid_generate_v4(),
  client_id         uuid not null references clients(id) on delete cascade,
  license_number    text unique,                    -- null until issued
  license_type      text not null,                  -- 'Central', 'State', 'Registration'
  category          text,                           -- FBO category
  state_code        text,
  authority_office  text,
  issue_date        date,
  expiry_date       date,
  -- Vault-encrypted FSSAI portal credentials
  vault_credential_id  text,                        -- Supabase Vault secret ID
  credential_username  text,                        -- plain username (login ID, not password)
  last_credential_accessed_at  timestamptz,
  last_credential_accessed_by  uuid references profiles(id),
  is_active         boolean not null default true,
  notes             text,
  created_by        uuid references profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger licenses_updated_at
  before update on licenses
  for each row execute procedure moddatetime(updated_at);

create index licenses_client_idx on licenses(client_id);
create index licenses_expiry_idx on licenses(expiry_date) where is_active = true;

-- ============================================================
-- 4. CREDENTIAL ACCESS LOG (append-only audit)
-- ============================================================
create table credential_access_log (
  id            uuid primary key default uuid_generate_v4(),
  license_id    uuid not null references licenses(id) on delete cascade,
  accessed_by   uuid not null references profiles(id),
  accessed_at   timestamptz not null default now(),
  ip_address    text,
  reason        text
);

-- No updates allowed — append only
create rule credential_access_log_no_update as on update to credential_access_log do instead nothing;
create rule credential_access_log_no_delete as on delete to credential_access_log do instead nothing;

-- ============================================================
-- 5. PROJECTS
-- ============================================================
create table projects (
  id                uuid primary key default uuid_generate_v4(),
  client_id         uuid not null references clients(id),
  license_id        uuid references licenses(id),
  project_code      text not null unique,            -- e.g. TPS-2026-001
  project_name      text not null,
  service_type      text not null,                   -- 'New Application', 'Renewal', 'Modification', etc.
  status            project_status not null default 'active',
  assigned_to       uuid references profiles(id),    -- primary executive
  manager_id        uuid references profiles(id),
  -- Three-clock state
  active_clock      clock_type not null default 'employee',
  clock_switched_at timestamptz not null default now(),
  -- Block state
  is_blocked        boolean not null default false,
  block_type        block_type,
  block_reason      text,
  block_started_at  timestamptz,    -- set to manager APPROVAL time, NOT request time
  block_expires_at  timestamptz,
  -- Timeline
  start_date        date not null default current_date,
  target_date       date,
  completed_date    date,
  -- Financials
  quoted_amount     bigint not null default 0,       -- stored in paise (₹ × 100)
  paid_amount       bigint not null default 0,
  payment_status    payment_status not null default 'pending',
  notes             text,
  created_by        uuid references profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger projects_updated_at
  before update on projects
  for each row execute procedure moddatetime(updated_at);

create index projects_client_idx  on projects(client_id);
create index projects_assignee_idx on projects(assigned_to);
create index projects_status_idx  on projects(status);

-- Auto-generate project_code: TPS-YYYY-NNN
create sequence project_seq;

create or replace function generate_project_code()
returns trigger language plpgsql as $$
begin
  new.project_code := 'TPS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('project_seq')::text, 3, '0');
  return new;
end;
$$;

create trigger projects_code_gen
  before insert on projects
  for each row when (new.project_code is null or new.project_code = '')
  execute procedure generate_project_code();

-- ============================================================
-- 6. BLOCK REQUESTS
-- ============================================================
create table block_requests (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references projects(id) on delete cascade,
  requested_by    uuid not null references profiles(id),
  requested_at    timestamptz not null default now(),
  block_type      block_type not null,
  reason          text not null,
  -- Approval flow
  reviewed_by     uuid references profiles(id),
  reviewed_at     timestamptz,
  approved        boolean,                           -- null=pending, true=approved, false=rejected
  rejection_note  text
);

create index block_requests_project_idx on block_requests(project_id);
create index block_requests_pending_idx on block_requests(approved) where approved is null;

-- ============================================================
-- 7. STAGES (workflow stages per project)
-- ============================================================
create table stages (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references projects(id) on delete cascade,
  stage_order     smallint not null,
  stage_name      text not null,
  stage_code      text,                              -- e.g. 'DOC_COLLECTION', 'FORM_SUBMISSION'
  status          stage_status not null default 'pending',
  assigned_to     uuid references profiles(id),
  started_at      timestamptz,
  completed_at    timestamptz,
  due_date        date,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(project_id, stage_order)
);

create trigger stages_updated_at
  before update on stages
  for each row execute procedure moddatetime(updated_at);

create index stages_project_idx on stages(project_id);

-- ============================================================
-- 8. STAGE TIMELINE LOG (append-only clock history)
-- ============================================================
create table stage_timeline (
  id            uuid primary key default uuid_generate_v4(),
  project_id    uuid not null references projects(id) on delete cascade,
  stage_id      uuid references stages(id),
  clock_type    clock_type not null,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  duration_min  integer generated always as (
    extract(epoch from (coalesce(ended_at, now()) - started_at)) / 60
  ) stored,
  note          text,
  created_by    uuid references profiles(id)
);

create index stage_timeline_project_idx on stage_timeline(project_id);

-- ============================================================
-- 9. PAYMENTS
-- ============================================================
create table payments (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references projects(id) on delete cascade,
  client_id       uuid not null references clients(id),
  amount          bigint not null,                   -- paise
  payment_date    date not null,
  payment_mode    text not null,                     -- 'NEFT', 'UPI', 'Cash', 'Cheque'
  reference_no    text,
  invoice_no      text,
  notes           text,
  recorded_by     uuid references profiles(id),
  created_at      timestamptz not null default now()
);

create index payments_project_idx on payments(project_id);

-- ============================================================
-- 10. DOCUMENTS
-- ============================================================
create table documents (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references projects(id) on delete cascade,
  client_id       uuid not null references clients(id),
  doc_type        document_type not null,
  file_name       text not null,
  storage_path    text not null,                     -- Supabase Storage path
  file_size_bytes bigint,
  mime_type       text,
  version         smallint not null default 1,
  is_latest       boolean not null default true,
  uploaded_by     uuid references profiles(id),
  created_at      timestamptz not null default now()
);

create index documents_project_idx on documents(project_id);

-- ============================================================
-- 11. AUTHORITY QUERIES (append-only — government deficiency letters etc.)
-- ============================================================
create table authority_queries (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references projects(id) on delete cascade,
  query_type      query_type not null,
  received_date   date not null,
  subject         text not null,
  description     text,
  response_due    date,
  responded_at    timestamptz,
  responded_by    uuid references profiles(id),
  response_note   text,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now()
);

-- Append-only — no deletes
create rule authority_queries_no_delete as on delete to authority_queries do instead nothing;

create index authority_queries_project_idx on authority_queries(project_id);

-- ============================================================
-- 12. SOI (Statement of Intent) ARCHIVE
-- ============================================================
create table soi_archive (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid not null references clients(id),
  project_id      uuid references projects(id),
  soi_date        date not null,
  product_category text,
  description     text,
  storage_path    text,                              -- PDF in Supabase Storage
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now()
);

create index soi_archive_client_idx on soi_archive(client_id);

-- ============================================================
-- 13. NOTIFICATIONS
-- ============================================================
create table notifications (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references profiles(id) on delete cascade,
  type            notification_type not null,
  title           text not null,
  body            text,
  reference_id    uuid,                              -- project_id / license_id etc.
  reference_type  text,                              -- 'project' | 'license' | 'payment'
  is_read         boolean not null default false,
  created_at      timestamptz not null default now()
);

create index notifications_user_idx on notifications(user_id, is_read);

-- ============================================================
-- 14. KNOWLEDGE BASE
-- ============================================================
create table knowledge_base (
  id              uuid primary key default uuid_generate_v4(),
  title           text not null,
  category        text not null,                     -- 'FSSAI', 'ISO', 'Procedure', 'Template'
  content         text not null,
  tags            text[],
  is_published    boolean not null default false,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger knowledge_base_updated_at
  before update on knowledge_base
  for each row execute procedure moddatetime(updated_at);

-- ============================================================
-- 15. PERFORMANCE REPORTS
-- ============================================================
create table performance_reports (
  id              uuid primary key default uuid_generate_v4(),
  report_period   text not null,                     -- 'YYYY-MM' monthly
  user_id         uuid references profiles(id),
  projects_closed integer not null default 0,
  avg_closure_days numeric(6,2),
  revenue_paise   bigint not null default 0,
  on_time_rate    numeric(5,2),
  report_data     jsonb,                             -- full snapshot
  generated_by    uuid references profiles(id),
  created_at      timestamptz not null default now()
);

-- ============================================================
-- 16. AUDIT LOG (append-only — all sensitive actions)
-- ============================================================
create table audit_log (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references profiles(id),
  action          text not null,                     -- 'credential_reveal', 'project_close', etc.
  table_name      text,
  record_id       uuid,
  old_data        jsonb,
  new_data        jsonb,
  ip_address      text,
  created_at      timestamptz not null default now()
);

-- Append-only
create rule audit_log_no_update as on update to audit_log do instead nothing;
create rule audit_log_no_delete as on delete to audit_log do instead nothing;

create index audit_log_user_idx   on audit_log(user_id);
create index audit_log_action_idx on audit_log(action);
create index audit_log_time_idx   on audit_log(created_at desc);
