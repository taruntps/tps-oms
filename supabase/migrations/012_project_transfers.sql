-- Migration 012: Project transfer with acceptance handshake
--
-- A project's assignee (or an Assigner / admin) can hand a project to someone else.
-- Normal transfers are PENDING until the recipient accepts; only super_admin can
-- force an immediate transfer (e.g. when the current assignee is on leave).
--
-- All mutations go through SECURITY DEFINER RPCs (they bypass RLS as owner and keep
-- the assigned_to change atomic with the transfer record). Direct writes are blocked.

do $$ begin
  create type project_transfer_status as enum ('pending', 'accepted', 'rejected', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists project_transfers (
  id           uuid primary key default uuid_generate_v4(),
  project_id   uuid not null references projects(id) on delete cascade,
  from_user    uuid references profiles(id),       -- assignee at time of request
  to_user      uuid not null references profiles(id),
  reason       text,
  status       project_transfer_status not null default 'pending',
  initiated_by uuid not null references profiles(id),
  forced       boolean not null default false,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references profiles(id)
);
create index if not exists project_transfers_to_pending_idx
  on project_transfers(to_user) where status = 'pending';
create index if not exists project_transfers_project_idx on project_transfers(project_id);

alter table project_transfers enable row level security;

-- Visible to involved parties, or anyone with full visibility. No direct
-- insert/update policy — mutations happen through the RPCs below.
drop policy if exists "project_transfers_select" on project_transfers;
create policy "project_transfers_select" on project_transfers
  for select using (
    fn_can_view_all_projects()
    or from_user    = auth.uid()
    or to_user      = auth.uid()
    or initiated_by = auth.uid()
  );

-- ── INITIATE ─────────────────────────────────────────────────────────────────
create or replace function initiate_project_transfer(
  p_project_id uuid,
  p_to_user    uuid,
  p_reason     text default null
)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_caller   uuid := auth.uid();
  v_is_admin boolean;
  v_assigned uuid;
  v_active   boolean;
begin
  select role = 'super_admin' into v_is_admin from profiles where id = v_caller;
  select assigned_to into v_assigned from projects where id = p_project_id;

  -- Permission: assignee of this project, or an Assigner, or admin.
  if not (v_is_admin or fn_can_assign() or v_assigned = v_caller) then
    raise exception 'You are not allowed to transfer this project';
  end if;

  select is_active into v_active from profiles where id = p_to_user;
  if v_active is not true then raise exception 'Recipient is not an active user'; end if;
  if p_to_user = v_assigned then raise exception 'Project is already assigned to this person'; end if;
  if exists (select 1 from project_transfers where project_id = p_project_id and status = 'pending') then
    raise exception 'There is already a pending transfer for this project';
  end if;

  if v_is_admin then
    -- Forced, immediate (no acceptance required)
    insert into project_transfers(project_id, from_user, to_user, reason, status, initiated_by, forced, resolved_at, resolved_by)
    values (p_project_id, v_assigned, p_to_user, p_reason, 'accepted', v_caller, true, now(), v_caller);
    update projects set assigned_to = p_to_user, updated_at = now() where id = p_project_id;
    insert into notifications(user_id, type, title, body, reference_id, reference_type)
    values (p_to_user, 'project_assigned', 'Project assigned to you',
            'Admin assigned you a project' || coalesce(' — ' || p_reason, ''), p_project_id, 'project');
    return 'forced';
  else
    insert into project_transfers(project_id, from_user, to_user, reason, status, initiated_by)
    values (p_project_id, v_assigned, p_to_user, p_reason, 'pending', v_caller);
    insert into notifications(user_id, type, title, body, reference_id, reference_type)
    values (p_to_user, 'project_assigned', 'Project transfer request',
            'A project transfer is awaiting your acceptance' || coalesce(' — ' || p_reason, ''), p_project_id, 'project');
    return 'pending';
  end if;
end;
$$;

-- ── RESPOND (recipient accepts/rejects) ──────────────────────────────────────
create or replace function respond_project_transfer(
  p_transfer_id uuid,
  p_accept      boolean
)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_t      project_transfers%rowtype;
begin
  select * into v_t from project_transfers where id = p_transfer_id;
  if not found then raise exception 'Transfer not found'; end if;
  if v_t.to_user <> v_caller then raise exception 'Only the recipient can respond to this transfer'; end if;
  if v_t.status <> 'pending' then raise exception 'This transfer is no longer pending'; end if;

  if p_accept then
    update project_transfers set status = 'accepted', resolved_at = now(), resolved_by = v_caller where id = p_transfer_id;
    update projects set assigned_to = v_t.to_user, updated_at = now() where id = v_t.project_id;
    insert into notifications(user_id, type, title, body, reference_id, reference_type)
    values (v_t.initiated_by, 'project_assigned', 'Transfer accepted',
            'Your project transfer was accepted', v_t.project_id, 'project');
    return 'accepted';
  else
    update project_transfers set status = 'rejected', resolved_at = now(), resolved_by = v_caller where id = p_transfer_id;
    insert into notifications(user_id, type, title, body, reference_id, reference_type)
    values (v_t.initiated_by, 'project_assigned', 'Transfer rejected',
            'Your project transfer was rejected', v_t.project_id, 'project');
    return 'rejected';
  end if;
end;
$$;

-- ── CANCEL (initiator or admin, while pending) ───────────────────────────────
create or replace function cancel_project_transfer(p_transfer_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_t      project_transfers%rowtype;
  v_admin  boolean;
begin
  select * into v_t from project_transfers where id = p_transfer_id;
  if not found then raise exception 'Transfer not found'; end if;
  select role = 'super_admin' into v_admin from profiles where id = v_caller;
  if not (v_t.initiated_by = v_caller or v_admin) then raise exception 'Not allowed to cancel this transfer'; end if;
  if v_t.status <> 'pending' then raise exception 'Only pending transfers can be cancelled'; end if;
  update project_transfers set status = 'cancelled', resolved_at = now(), resolved_by = v_caller where id = p_transfer_id;
end;
$$;
