-- ============================================================
-- TPS-OMS Migration 004: Vault Functions, pg_cron Jobs & Seed Data
-- ============================================================

-- ============================================================
-- VAULT: Store & reveal FSSAI portal credentials
-- Only callable server-side (Edge Function or service_role)
-- The browser NEVER sees the AES key.
-- ============================================================

-- Store a new credential in Vault, update license, log access
create or replace function store_fssai_credential(
  p_license_id  uuid,
  p_username    text,
  p_password    text,   -- plaintext, will be encrypted by Vault
  p_reason      text    default 'Initial setup'
)
returns void
language plpgsql
security definer  -- runs as postgres, not the calling user
set search_path = public
as $$
declare
  v_secret_id text;
  v_secret_name text;
begin
  -- Only manager+ can call this
  if not has_role('super_admin', 'director', 'manager') then
    raise exception 'Insufficient privileges to store credentials';
  end if;

  v_secret_name := 'fssai_cred_' || p_license_id::text;

  -- Store in Vault (Supabase Vault AES-256)
  select id::text into v_secret_id
  from vault.create_secret(
    p_password,
    v_secret_name,
    'FSSAI portal password for license ' || p_license_id::text
  );

  -- Update license with vault reference
  update licenses
  set
    vault_credential_id = v_secret_id,
    credential_username = p_username,
    updated_at = now()
  where id = p_license_id;

  -- Audit log
  insert into audit_log(user_id, action, table_name, record_id, new_data)
  values (
    auth.uid(),
    'credential_store',
    'licenses',
    p_license_id,
    jsonb_build_object('username', p_username, 'reason', p_reason)
  );
end;
$$;

-- Reveal credential — called by Edge Function only (service_role)
create or replace function reveal_fssai_credential(
  p_license_id  uuid,
  p_reason      text default 'Portal access required'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret_id text;
  v_password  text;
begin
  -- Manager/executive with project access only
  if not has_role('super_admin', 'director', 'manager', 'executive') then
    raise exception 'Insufficient privileges to reveal credentials';
  end if;

  -- Get vault ID
  select vault_credential_id into v_secret_id
  from licenses where id = p_license_id;

  if v_secret_id is null then
    raise exception 'No credential stored for this license';
  end if;

  -- Decrypt from Vault
  select decrypted_secret into v_password
  from vault.decrypted_secrets
  where id = v_secret_id::uuid;

  -- Update last accessed
  update licenses
  set
    last_credential_accessed_at = now(),
    last_credential_accessed_by = auth.uid()
  where id = p_license_id;

  -- Append-only access log
  insert into credential_access_log(license_id, accessed_by, reason)
  values (p_license_id, auth.uid(), p_reason);

  -- Audit log
  insert into audit_log(user_id, action, table_name, record_id, new_data)
  values (
    auth.uid(),
    'credential_reveal',
    'licenses',
    p_license_id,
    jsonb_build_object('reason', p_reason)
  );

  return v_password;
end;
$$;

-- ============================================================
-- BLOCK REQUEST APPROVAL FUNCTION
-- blockStartedAt = manager approval time (anti-abuse rule)
-- ============================================================
create or replace function approve_block_request(
  p_request_id uuid,
  p_approved   boolean,
  p_note       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req block_requests%rowtype;
begin
  if not has_role('super_admin', 'director', 'manager') then
    raise exception 'Only managers can approve block requests';
  end if;

  select * into v_req from block_requests where id = p_request_id;

  if v_req.approved is not null then
    raise exception 'This request has already been reviewed';
  end if;

  -- Update the request
  update block_requests
  set
    reviewed_by    = auth.uid(),
    reviewed_at    = now(),
    approved       = p_approved,
    rejection_note = p_note
  where id = p_request_id;

  if p_approved then
    -- Switch project clock to 'client' and set block
    -- block_started_at = NOW() (manager approval time, NOT request time)
    update projects
    set
      is_blocked        = true,
      block_type        = v_req.block_type,
      block_reason      = v_req.reason,
      block_started_at  = now(),
      active_clock      = 'client',
      clock_switched_at = now()
    where id = v_req.project_id;

    -- Log clock switch in timeline
    insert into stage_timeline(project_id, clock_type, note, created_by)
    values (v_req.project_id, 'client', 'Block approved: ' || v_req.reason, auth.uid());
  end if;

  -- Audit
  insert into audit_log(user_id, action, table_name, record_id, new_data)
  values (
    auth.uid(),
    case when p_approved then 'block_approved' else 'block_rejected' end,
    'block_requests',
    p_request_id,
    jsonb_build_object('approved', p_approved, 'note', p_note)
  );
end;
$$;

-- Unblock project (manager action)
create or replace function unblock_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_role('super_admin', 'director', 'manager') then
    raise exception 'Only managers can unblock projects';
  end if;

  update projects
  set
    is_blocked        = false,
    block_type        = null,
    block_reason      = null,
    block_started_at  = null,
    block_expires_at  = null,
    active_clock      = 'employee',
    clock_switched_at = now()
  where id = p_project_id;

  -- Log clock switch
  insert into stage_timeline(project_id, clock_type, note, created_by)
  values (p_project_id, 'employee', 'Project unblocked — clock back to TPS', auth.uid());

  insert into audit_log(user_id, action, table_name, record_id)
  values (auth.uid(), 'project_unblocked', 'projects', p_project_id);
end;
$$;

-- ============================================================
-- pg_cron SCHEDULED JOBS
-- ============================================================

-- Job 1: License expiry alerts — daily at 8 AM IST (2:30 UTC)
select cron.schedule(
  'license-expiry-alerts',
  '30 2 * * *',
  $$
  insert into notifications(user_id, type, title, body, reference_id, reference_type)
  select
    p.assigned_to,
    'license_expiring'::notification_type,
    'License expiring: ' || c.company_name,
    'FSSAI licence ' || coalesce(l.license_number, 'pending') || ' expires on ' || to_char(l.expiry_date, 'DD/MM/YYYY'),
    l.id,
    'license'
  from licenses l
  join clients c on c.id = l.client_id
  join projects p on p.license_id = l.id and p.status = 'active'
  where
    l.is_active = true
    and l.expiry_date is not null
    and l.expiry_date between current_date + 7 and current_date + 90
    and p.assigned_to is not null
  on conflict do nothing;
  $$
);

-- Job 2: Overdue stage alerts — daily at 9 AM IST (3:30 UTC)
select cron.schedule(
  'overdue-stage-alerts',
  '30 3 * * *',
  $$
  insert into notifications(user_id, type, title, body, reference_id, reference_type)
  select
    coalesce(s.assigned_to, p.assigned_to),
    'stage_overdue'::notification_type,
    'Stage overdue: ' || s.stage_name,
    'Stage "' || s.stage_name || '" on project ' || p.project_code || ' was due ' || to_char(s.due_date, 'DD/MM/YYYY'),
    p.id,
    'project'
  from stages s
  join projects p on p.id = s.project_id
  where
    s.status in ('pending','in_progress')
    and s.due_date < current_date
    and p.status = 'active'
    and (p.assigned_to is not null or s.assigned_to is not null)
  on conflict do nothing;
  $$
);

-- Job 3: Payment overdue alerts — weekly Monday 9 AM IST (3:30 UTC)
select cron.schedule(
  'payment-overdue-alerts',
  '30 3 * * 1',
  $$
  insert into notifications(user_id, type, title, body, reference_id, reference_type)
  select
    p.manager_id,
    'payment_overdue'::notification_type,
    'Payment overdue: ' || c.company_name,
    'Project ' || p.project_code || ' has outstanding payment of ₹' ||
      to_char((p.quoted_amount - p.paid_amount) / 100.0, 'FM99,99,999.00'),
    p.id,
    'project'
  from projects p
  join clients c on c.id = p.client_id
  where
    p.status = 'active'
    and p.payment_status in ('pending','partial','overdue')
    and p.quoted_amount > p.paid_amount
    and p.manager_id is not null
  on conflict do nothing;
  $$
);

-- ============================================================
-- SEED DATA: Default workflow stages template
-- ============================================================

-- Stage templates for new FSSAI application projects
create table stage_templates (
  id            uuid primary key default uuid_generate_v4(),
  service_type  text not null,
  stage_order   smallint not null,
  stage_name    text not null,
  stage_code    text not null,
  default_days  smallint,   -- expected duration
  unique(service_type, stage_order)
);

insert into stage_templates(service_type, stage_order, stage_name, stage_code, default_days) values
  -- New FSSAI Central Licence
  ('New Application', 1,  'Document Collection',        'DOC_COLLECTION',    7),
  ('New Application', 2,  'Document Verification',      'DOC_VERIFY',        3),
  ('New Application', 3,  'Form Filling',               'FORM_FILL',         2),
  ('New Application', 4,  'Client Approval of Form',    'CLIENT_APPROVAL',   3),
  ('New Application', 5,  'Form Submission to FSSAI',   'FORM_SUBMIT',       1),
  ('New Application', 6,  'Fee Payment',                'FEE_PAYMENT',       2),
  ('New Application', 7,  'Scrutiny by Authority',      'SCRUTINY',         30),
  ('New Application', 8,  'Deficiency Reply (if any)',  'DEF_REPLY',         7),
  ('New Application', 9,  'Inspection (if required)',   'INSPECTION',       14),
  ('New Application', 10, 'Licence Issued',             'LICENCE_ISSUED',    1),
  -- Renewal
  ('Renewal', 1,  'Renewal Notice to Client',   'RENEW_NOTICE',      7),
  ('Renewal', 2,  'Document Collection',        'DOC_COLLECTION',    5),
  ('Renewal', 3,  'Form Filling & Submission',  'FORM_SUBMIT',       3),
  ('Renewal', 4,  'Fee Payment',                'FEE_PAYMENT',       2),
  ('Renewal', 5,  'Authority Processing',       'AUTH_PROCESS',     30),
  ('Renewal', 6,  'Licence Renewed',            'LICENCE_ISSUED',    1),
  -- Modification
  ('Modification', 1, 'Document Collection',    'DOC_COLLECTION',    5),
  ('Modification', 2, 'Form Filling',           'FORM_FILL',         2),
  ('Modification', 3, 'Form Submission',        'FORM_SUBMIT',       1),
  ('Modification', 4, 'Authority Processing',   'AUTH_PROCESS',     21),
  ('Modification', 5, 'Modification Approved',  'LICENCE_ISSUED',    1);

-- Function: auto-create stages from template when project is created
create or replace function create_stages_from_template()
returns trigger language plpgsql as $$
begin
  insert into stages(project_id, stage_order, stage_name, stage_code, due_date, assigned_to)
  select
    new.id,
    t.stage_order,
    t.stage_name,
    t.stage_code,
    new.start_date + (sum(t2.default_days) over (order by t2.stage_order))::integer,
    new.assigned_to
  from stage_templates t
  join stage_templates t2 on t2.service_type = t.service_type and t2.stage_order <= t.stage_order
  where t.service_type = new.service_type
  group by t.stage_order, t.stage_name, t.stage_code, t.default_days, new.id, new.start_date, new.assigned_to
  order by t.stage_order;

  return new;
end;
$$;

create trigger projects_auto_stages
  after insert on projects
  for each row execute procedure create_stages_from_template();

-- Initial timeline entry when project is created
create or replace function create_initial_timeline()
returns trigger language plpgsql as $$
begin
  insert into stage_timeline(project_id, clock_type, note, created_by)
  values (new.id, 'employee', 'Project created', new.created_by);
  return new;
end;
$$;

create trigger projects_initial_timeline
  after insert on projects
  for each row execute procedure create_initial_timeline();
