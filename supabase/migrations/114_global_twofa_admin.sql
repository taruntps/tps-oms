-- 114 — Admin-controlled global 2FA: set_twofa_required flips every user's flag;
-- new users inherit via trigger. Applied live via apply_migration.
create or replace function public.set_twofa_required(p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role('super_admin', 'director') then raise exception 'Insufficient privileges to change the 2FA policy'; end if;
  insert into public.app_settings (key, value, description)
  values ('twofa_required', case when p_on then 'true' else 'false' end, 'Require SMS/email OTP two-factor for all users at login')
  on conflict (key) do update set value = excluded.value, updated_at = now();
  update public.profiles set twofa_enabled = p_on where is_active = true;
end $$;
revoke execute on function public.set_twofa_required(boolean) from anon;

create or replace function public.apply_global_twofa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select value from public.app_settings where key = 'twofa_required'), 'false') = 'true' then
    new.twofa_enabled := true;
  end if;
  return new;
end $$;
drop trigger if exists trg_apply_global_twofa on public.profiles;
create trigger trg_apply_global_twofa before insert on public.profiles for each row execute function public.apply_global_twofa();
