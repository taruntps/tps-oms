-- Migration 025: Referrals + client create/edit/delete lifecycle
--
-- - referrals table + clients.referral_id (who referred the client).
-- - Any logged-in staff can CREATE a client; EDIT requires the Edit-Clients right
--   (fixes the old manager-only update policy so the flag actually grants edit).
-- - delete_client() RPC: admin-only, permanent, but only when the client has no
--   linked projects / licences / payments / documents (safe wrong-entry cleanup).

-- ── Referrals ────────────────────────────────────────────────────────────────
create table if not exists referrals (
  id             uuid primary key default uuid_generate_v4(),
  name           text not null,
  contact_person text,
  phone          text,
  email          text,
  notes          text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);
alter table referrals enable row level security;
drop policy if exists "referrals_select" on referrals;
create policy "referrals_select" on referrals for select using (auth.uid() is not null);
drop policy if exists "referrals_write" on referrals;
create policy "referrals_write" on referrals for all
  using (has_role('super_admin','director','manager'))
  with check (has_role('super_admin','director','manager'));

alter table clients add column if not exists referral_id uuid references referrals(id) on delete set null;

-- ── Client create (open) + edit (rights-based) ───────────────────────────────
drop policy if exists "clients_insert_manager_up" on clients;
drop policy if exists "clients_insert" on clients;
create policy "clients_insert" on clients
  for insert with check (auth.uid() is not null);

drop policy if exists "clients_update_manager_up" on clients;
drop policy if exists "clients_update" on clients;
create policy "clients_update" on clients
  for update using (fn_can_edit_clients());

-- ── Admin client delete (only if empty) ──────────────────────────────────────
create or replace function delete_client(p_client_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role('super_admin','director') then
    raise exception 'Only an admin can delete clients';
  end if;
  if exists (select 1 from projects        where client_id = p_client_id) then
    raise exception 'Cannot delete: this client has projects. Cancel/remove them first.';
  end if;
  if exists (select 1 from licenses        where client_id = p_client_id) then
    raise exception 'Cannot delete: this client has FSSAI licences.';
  end if;
  if exists (select 1 from client_documents where client_id = p_client_id) then
    raise exception 'Cannot delete: this client has documents. Delete them first.';
  end if;
  if exists (select 1 from payments        where client_id = p_client_id) then
    raise exception 'Cannot delete: this client has payment records.';
  end if;
  delete from clients where id = p_client_id;
end;
$$;
