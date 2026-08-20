-- 113 — Self-managed OTP (SMS + email) + global 2FA flag. Applied live via apply_migration.
alter table public.otp_challenges
  add column if not exists code_hash text,
  add column if not exists email text;
alter table public.otp_challenges alter column session_id drop not null;
insert into public.app_settings (key, value, description)
values ('twofa_required', 'false', 'Require SMS/email OTP two-factor for all users at login')
on conflict (key) do nothing;
