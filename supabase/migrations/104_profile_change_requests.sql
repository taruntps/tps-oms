-- 104 — Employee self-service profile change requests with admin approval.
-- Employee submits a JSONB payload (personal / emergency / bank / statutory);
-- it stays pending until an admin approves, at which point review_profile_change
-- writes the values into the real tables. Admin-only after approval.
-- Applied to live (gytscakgtsbxgdkbqhbx) 2026-08-18.

create table if not exists public.hr_profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  note text,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz
);
create index if not exists idx_profile_change_emp_status
  on public.hr_profile_change_requests (employee_id, status);

alter table public.hr_profile_change_requests enable row level security;

drop policy if exists pcr_read on public.hr_profile_change_requests;
create policy pcr_read on public.hr_profile_change_requests for select to public
  using (employee_id = auth.uid()
    or auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role,'manager'::user_role]));

drop policy if exists pcr_insert on public.hr_profile_change_requests;
create policy pcr_insert on public.hr_profile_change_requests for insert to public
  with check (employee_id = auth.uid());

drop policy if exists pcr_update on public.hr_profile_change_requests;
create policy pcr_update on public.hr_profile_change_requests for update to public
  using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role]));

-- ── Submit: employee lodges a change request (blocked if one is pending/approved) ──
create or replace function public.submit_profile_change(p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if exists (select 1 from public.hr_profile_change_requests where employee_id = v_uid and status = 'pending') then
    raise exception 'You already have a submission awaiting approval.';
  end if;
  if exists (select 1 from public.hr_profile_change_requests where employee_id = v_uid and status = 'approved') then
    raise exception 'Your profile is already approved. Please contact admin/HR to make changes.';
  end if;
  insert into public.hr_profile_change_requests (employee_id, payload)
    values (v_uid, p_payload) returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.submit_profile_change(jsonb) from anon;

-- ── Review: admin approves (writes to real tables) or rejects (with note) ──
create or replace function public.review_profile_change(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.hr_profile_change_requests; p jsonb; per jsonb; emg jsonb; bnk jsonb; sta jsonb; n int;
begin
  if not has_role('super_admin','director','hr') then
    raise exception 'Insufficient privileges to review profile changes';
  end if;
  select * into r from public.hr_profile_change_requests where id = p_id and status = 'pending';
  if not found then raise exception 'Request not found or already reviewed'; end if;

  if not p_approve then
    update public.hr_profile_change_requests
      set status='rejected', note=p_note, reviewed_by=auth.uid(), reviewed_at=now() where id=p_id;
    return;
  end if;

  p   := r.payload;
  per := p->'personal';
  emg := p->'emergency';
  bnk := p->'bank';
  sta := p->'statutory';

  -- Personal + PAN/Aadhaar → employee_details (upsert on user_id; coalesce keeps old on blanks)
  insert into public.employee_details as ed (user_id, date_of_birth, gender, marital_status, blood_group,
      nationality, permanent_address, local_address, personal_email, home_phone, father_name, mother_name,
      pan_no, aadhar_no)
  values (r.employee_id,
      nullif(per->>'date_of_birth','')::date, nullif(per->>'gender',''), nullif(per->>'marital_status',''),
      nullif(per->>'blood_group',''), nullif(per->>'nationality',''), nullif(per->>'permanent_address',''),
      nullif(per->>'local_address',''), nullif(per->>'personal_email',''), nullif(per->>'home_phone',''),
      nullif(per->>'father_name',''), nullif(per->>'mother_name',''),
      nullif(sta->>'pan_no',''), nullif(sta->>'aadhar_no',''))
  on conflict (user_id) do update set
      date_of_birth     = coalesce(excluded.date_of_birth, ed.date_of_birth),
      gender            = coalesce(excluded.gender, ed.gender),
      marital_status    = coalesce(excluded.marital_status, ed.marital_status),
      blood_group       = coalesce(excluded.blood_group, ed.blood_group),
      nationality       = coalesce(excluded.nationality, ed.nationality),
      permanent_address = coalesce(excluded.permanent_address, ed.permanent_address),
      local_address     = coalesce(excluded.local_address, ed.local_address),
      personal_email    = coalesce(excluded.personal_email, ed.personal_email),
      home_phone        = coalesce(excluded.home_phone, ed.home_phone),
      father_name       = coalesce(excluded.father_name, ed.father_name),
      mother_name       = coalesce(excluded.mother_name, ed.mother_name),
      pan_no            = coalesce(excluded.pan_no, ed.pan_no),
      aadhar_no         = coalesce(excluded.aadhar_no, ed.aadhar_no),
      updated_at        = now();

  -- Emergency contact → hr_emergency_contacts (update the primary, else insert one)
  if emg is not null and coalesce(emg->>'name','') <> '' then
    update public.hr_emergency_contacts
      set name=emg->>'name', relation=nullif(emg->>'relation',''), phone=nullif(emg->>'phone','')
      where employee_id=r.employee_id and is_primary=true;
    get diagnostics n = row_count;
    if n = 0 then
      insert into public.hr_emergency_contacts (employee_id, name, relation, phone, is_primary)
        values (r.employee_id, emg->>'name', nullif(emg->>'relation',''), nullif(emg->>'phone',''), true);
    end if;
  end if;

  -- Bank → hr_employee_bank (update the primary, else insert one)
  if bnk is not null and coalesce(bnk->>'account_no','') <> '' then
    update public.hr_employee_bank
      set account_name=nullif(bnk->>'account_name',''), account_no=bnk->>'account_no',
          ifsc=nullif(bnk->>'ifsc',''), bank_name=nullif(bnk->>'bank_name',''), branch=nullif(bnk->>'branch',''),
          updated_at=now()
      where employee_id=r.employee_id and is_primary=true;
    get diagnostics n = row_count;
    if n = 0 then
      insert into public.hr_employee_bank (employee_id, account_name, account_no, ifsc, bank_name, branch, is_primary)
        values (r.employee_id, nullif(bnk->>'account_name',''), bnk->>'account_no', nullif(bnk->>'ifsc',''),
                nullif(bnk->>'bank_name',''), nullif(bnk->>'branch',''), true);
    end if;
  end if;

  -- Statutory UAN/ESI/PF/PRAN → hr_employee_statutory_ids (update, else insert)
  if sta is not null and (coalesce(sta->>'uan','')<>'' or coalesce(sta->>'esi_no','')<>''
                          or coalesce(sta->>'pf_no','')<>'' or coalesce(sta->>'pran','')<>'') then
    update public.hr_employee_statutory_ids
      set uan=coalesce(nullif(sta->>'uan',''), uan), pf_no=coalesce(nullif(sta->>'pf_no',''), pf_no),
          esi_no=coalesce(nullif(sta->>'esi_no',''), esi_no), pran=coalesce(nullif(sta->>'pran',''), pran),
          updated_at=now()
      where employee_id=r.employee_id;
    get diagnostics n = row_count;
    if n = 0 then
      insert into public.hr_employee_statutory_ids (employee_id, uan, pf_no, esi_no, pran)
        values (r.employee_id, nullif(sta->>'uan',''), nullif(sta->>'pf_no',''),
                nullif(sta->>'esi_no',''), nullif(sta->>'pran',''));
    end if;
  end if;

  update public.hr_profile_change_requests
    set status='approved', note=p_note, reviewed_by=auth.uid(), reviewed_at=now() where id=p_id;
end $$;
revoke execute on function public.review_profile_change(uuid, boolean, text) from anon;
