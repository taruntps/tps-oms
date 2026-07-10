-- Migration 069: Remarks tab, unblock/cancel approval flows, blocked-clock accounting,
--                and end-to-end approval notifications.
-- (Applied via MCP on 2026-07-10 — kept here for the migration record.)

-- ── 1. Project remarks ────────────────────────────────────────────────────────
create table if not exists project_remarks (
  id         uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  created_by uuid not null references profiles(id),
  remark     text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_project_remarks_project on project_remarks(project_id, created_at desc);
alter table project_remarks enable row level security;

create policy "remarks_select_staff" on project_remarks
  for select using (auth.uid() is not null);
create policy "remarks_insert_staff" on project_remarks
  for insert with check (created_by = auth.uid());
create policy "remarks_delete_own_or_admin" on project_remarks
  for delete using (created_by = auth.uid() or has_role('super_admin','director','manager'));

-- ── 2. Unblock requests ride on block_requests via request_kind ──────────────
alter table block_requests add column if not exists request_kind text not null default 'block'
  check (request_kind in ('block','unblock'));

-- ── 3. Blocked-clock accounting ───────────────────────────────────────────────
alter table projects add column if not exists blocked_minutes_total integer not null default 0;

-- ── 4. Cancel request review fields ──────────────────────────────────────────
alter table cancel_requests add column if not exists rejection_note text;

-- ── 5. Helper: notify all managers/directors/super_admins ────────────────────
create or replace function fn_notify_admins(p_type notification_type, p_title text, p_body text, p_ref uuid, p_meta jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, type, title, body, reference_id, reference_type, meta)
  select p.id, p_type, p_title, p_body, p_ref, 'project', p_meta
  from profiles p
  where p.role in ('super_admin','director','manager') and p.is_active = true;
end;
$$;

-- ── 6. Notify admins when a block/unblock request is raised ──────────────────
create or replace function fn_notify_block_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_code text; v_name text; v_client text; v_requester text;
begin
  select pr.project_code, pr.project_name, c.company_name
  into v_code, v_name, v_client
  from projects pr left join clients c on c.id = pr.client_id
  where pr.id = NEW.project_id;
  select name into v_requester from profiles where id = NEW.requested_by;

  perform fn_notify_admins(
    case when NEW.request_kind = 'unblock' then 'unblock_request'::notification_type else 'block_request'::notification_type end,
    initcap(NEW.request_kind) || ' request: ' || coalesce(v_code,''),
    coalesce(v_requester,'Someone') || ' requested to ' || NEW.request_kind || ' ' || coalesce(v_code,'') ||
      ' (' || coalesce(v_client,'') || '). Reason: ' || coalesce(NEW.reason,''),
    NEW.project_id,
    jsonb_build_object('project_code', coalesce(v_code,''), 'project_name', coalesce(v_name,''),
                       'client_name', coalesce(v_client,''), 'requester', coalesce(v_requester,''),
                       'kind', NEW.request_kind, 'reason', coalesce(NEW.reason,''))
  );
  return NEW;
end;
$$;
drop trigger if exists trg_notify_block_request on block_requests;
create trigger trg_notify_block_request
  after insert on block_requests
  for each row execute function fn_notify_block_request();

-- ── 7. Approve block/unblock — kind-aware + notifies the requester ───────────
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
  v_req  block_requests%rowtype;
  v_code text;
  v_blocked_since timestamptz;
begin
  if not has_role('super_admin', 'director', 'manager') then
    raise exception 'Only managers can approve block requests';
  end if;

  select * into v_req from block_requests where id = p_request_id;

  if v_req.approved is not null then
    raise exception 'This request has already been reviewed';
  end if;

  update block_requests
  set reviewed_by = auth.uid(), reviewed_at = now(),
      approved = p_approved, rejection_note = p_note
  where id = p_request_id;

  select project_code into v_code from projects where id = v_req.project_id;

  if p_approved and v_req.request_kind = 'block' then
    update projects
    set is_blocked = true, block_type = v_req.block_type, block_reason = v_req.reason,
        block_started_at = now(), active_clock = 'client', clock_switched_at = now()
    where id = v_req.project_id;

    insert into stage_timeline(project_id, clock_type, note, created_by)
    values (v_req.project_id, 'client', 'Block approved: ' || v_req.reason, auth.uid());

  elsif p_approved and v_req.request_kind = 'unblock' then
    select block_started_at into v_blocked_since from projects where id = v_req.project_id;
    update projects
    set is_blocked = false, block_type = null, block_reason = null,
        block_started_at = null, block_expires_at = null,
        blocked_minutes_total = blocked_minutes_total
          + coalesce(greatest(0, extract(epoch from (now() - v_blocked_since)) / 60)::int, 0),
        active_clock = 'employee', clock_switched_at = now()
    where id = v_req.project_id;

    insert into stage_timeline(project_id, clock_type, note, created_by)
    values (v_req.project_id, 'employee', 'Unblock approved: ' || v_req.reason, auth.uid());
  end if;

  insert into notifications (user_id, type, title, body, reference_id, reference_type, meta)
  values (
    v_req.requested_by,
    case when p_approved then 'block_approved'::notification_type else 'block_rejected'::notification_type end,
    initcap(v_req.request_kind) || ' request ' || case when p_approved then 'approved' else 'rejected' end || ': ' || coalesce(v_code,''),
    case when p_approved then 'Your ' || v_req.request_kind || ' request was approved.'
         else 'Your ' || v_req.request_kind || ' request was rejected.' || coalesce(' Note: ' || p_note, '') end,
    v_req.project_id, 'project',
    jsonb_build_object('project_code', coalesce(v_code,''), 'kind', v_req.request_kind,
                       'approved', p_approved, 'note', coalesce(p_note,''))
  );

  insert into audit_log(user_id, action, table_name, record_id, new_data)
  values (
    auth.uid(),
    case when p_approved then 'block_approved' else 'block_rejected' end,
    'block_requests', p_request_id,
    jsonb_build_object('approved', p_approved, 'note', p_note, 'kind', v_req.request_kind)
  );
end;
$$;

-- ── 8. Direct unblock (manager) also accumulates blocked minutes ─────────────
create or replace function unblock_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_blocked_since timestamptz;
begin
  if not has_role('super_admin', 'director', 'manager') then
    raise exception 'Only managers can unblock projects';
  end if;

  select block_started_at into v_blocked_since from projects where id = p_project_id;

  update projects
  set is_blocked = false, block_type = null, block_reason = null,
      block_started_at = null, block_expires_at = null,
      blocked_minutes_total = blocked_minutes_total
        + coalesce(greatest(0, extract(epoch from (now() - v_blocked_since)) / 60)::int, 0),
      active_clock = 'employee', clock_switched_at = now()
  where id = p_project_id;

  insert into stage_timeline(project_id, clock_type, note, created_by)
  values (p_project_id, 'employee', 'Project unblocked', auth.uid());

  insert into audit_log(user_id, action, table_name, record_id, new_data)
  values (auth.uid(), 'unblocked', 'projects', p_project_id, '{}'::jsonb);
end;
$$;

-- ── 9. Cancel request flow ────────────────────────────────────────────────────
create or replace function fn_notify_cancel_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_code text; v_name text; v_client text; v_requester text;
begin
  if NEW.status <> 'pending' then return NEW; end if;   -- direct admin cancels skip this
  select pr.project_code, pr.project_name, c.company_name
  into v_code, v_name, v_client
  from projects pr left join clients c on c.id = pr.client_id
  where pr.id = NEW.project_id;
  select name into v_requester from profiles where id = NEW.requested_by;

  perform fn_notify_admins(
    'cancel_request'::notification_type,
    'Cancellation request: ' || coalesce(v_code,''),
    coalesce(v_requester,'Someone') || ' requested cancellation of ' || coalesce(v_code,'') ||
      ' (' || coalesce(v_client,'') || '). Reason: ' || coalesce(NEW.reason,''),
    NEW.project_id,
    jsonb_build_object('project_code', coalesce(v_code,''), 'project_name', coalesce(v_name,''),
                       'client_name', coalesce(v_client,''), 'requester', coalesce(v_requester,''),
                       'reason', coalesce(NEW.reason,''))
  );
  return NEW;
end;
$$;
drop trigger if exists trg_notify_cancel_request on cancel_requests;
create trigger trg_notify_cancel_request
  after insert on cancel_requests
  for each row execute function fn_notify_cancel_request();

create or replace function approve_cancel_request(
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
  v_req  cancel_requests%rowtype;
  v_code text;
begin
  if not has_role('super_admin', 'director', 'manager') then
    raise exception 'Only managers can approve cancellation requests';
  end if;

  select * into v_req from cancel_requests where id = p_request_id;
  if v_req.status <> 'pending' then
    raise exception 'This request has already been reviewed';
  end if;

  update cancel_requests
  set status = case when p_approved then 'approved' else 'rejected' end,
      approved_by = auth.uid(), approved_at = now(), rejection_note = p_note
  where id = p_request_id;

  select project_code into v_code from projects where id = v_req.project_id;

  if p_approved then
    update projects
    set status = 'cancelled', cancel_reason = v_req.reason,
        cancelled_at = now(), cancelled_by = auth.uid()
    where id = v_req.project_id;
  end if;

  insert into notifications (user_id, type, title, body, reference_id, reference_type, meta)
  values (
    v_req.requested_by,
    case when p_approved then 'cancel_approved'::notification_type else 'cancel_rejected'::notification_type end,
    'Cancellation ' || case when p_approved then 'approved' else 'rejected' end || ': ' || coalesce(v_code,''),
    case when p_approved then 'Your cancellation request was approved — project is now cancelled.'
         else 'Your cancellation request was rejected.' || coalesce(' Note: ' || p_note, '') end,
    v_req.project_id, 'project',
    jsonb_build_object('project_code', coalesce(v_code,''), 'approved', p_approved, 'note', coalesce(p_note,''))
  );

  insert into audit_log(user_id, action, table_name, record_id, new_data)
  values (
    auth.uid(),
    case when p_approved then 'cancel_approved' else 'cancel_rejected' end,
    'cancel_requests', p_request_id,
    jsonb_build_object('approved', p_approved, 'note', p_note)
  );
end;
$$;
