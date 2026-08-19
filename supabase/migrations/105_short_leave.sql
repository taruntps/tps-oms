-- 105 — Short leave: 2 hours/month per employee (1h x2 or 2h x1), credited monthly
-- and lapsing monthly (no carry). Application → approval. An approved short leave
-- excuses that day's late-in/early-out penalty in the attendance evaluation (stage B).
-- Applied to the live DB via apply_migration; this file is the repo record.

create table if not exists public.hr_short_leaves (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  leave_date date not null,
  hours numeric(2,0) not null check (hours in (1, 2)),
  slot text not null default 'general' check (slot in ('late_in', 'early_out', 'general')),
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_short_leave_emp_date on public.hr_short_leaves (employee_id, leave_date);

alter table public.hr_short_leaves enable row level security;

drop policy if exists sl_read on public.hr_short_leaves;
create policy sl_read on public.hr_short_leaves for select to public
  using (employee_id = auth.uid()
    or auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role,'manager'::user_role,'auditor'::user_role]));

drop policy if exists sl_insert on public.hr_short_leaves;
create policy sl_insert on public.hr_short_leaves for insert to public
  with check (employee_id = auth.uid());

drop policy if exists sl_update on public.hr_short_leaves;
create policy sl_update on public.hr_short_leaves for update to public
  using (employee_id = auth.uid()
    or auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role]));

create or replace function public.short_leave_used(p_employee uuid, p_date date)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(hours), 0)::numeric
  from public.hr_short_leaves
  where employee_id = p_employee
    and status in ('approved', 'pending')
    and date_trunc('month', leave_date) = date_trunc('month', p_date);
$$;

create or replace function public.submit_short_leave(p_date date, p_hours numeric, p_slot text, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_hours not in (1, 2) then raise exception 'Short leave must be 1 or 2 hours'; end if;
  if public.short_leave_used(v_uid, p_date) + p_hours > 2 then
    raise exception 'Monthly short-leave limit is 2 hours. You have % hour(s) left this month.',
      greatest(0, 2 - public.short_leave_used(v_uid, p_date));
  end if;
  insert into public.hr_short_leaves (employee_id, leave_date, hours, slot, reason)
    values (v_uid, p_date, p_hours, coalesce(nullif(p_slot,''),'general'), nullif(p_reason,''))
    returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.submit_short_leave(date, numeric, text, text) from anon;

create or replace function public.review_short_leave(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.hr_short_leaves; v_approved numeric;
begin
  if not has_role('super_admin','director','hr','manager') then
    raise exception 'Insufficient privileges to review short leave';
  end if;
  select * into r from public.hr_short_leaves where id = p_id and status = 'pending';
  if not found then raise exception 'Request not found or already reviewed'; end if;
  if p_approve then
    select coalesce(sum(hours),0) into v_approved from public.hr_short_leaves
      where employee_id = r.employee_id and status = 'approved'
        and date_trunc('month', leave_date) = date_trunc('month', r.leave_date);
    if v_approved + r.hours > 2 then
      raise exception 'Approving this exceeds the 2-hour monthly limit for this employee.';
    end if;
  end if;
  update public.hr_short_leaves
    set status = case when p_approve then 'approved' else 'rejected' end,
        note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_id;
end $$;
revoke execute on function public.review_short_leave(uuid, boolean, text) from anon;
