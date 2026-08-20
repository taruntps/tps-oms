-- 112 — SMS OTP (2Factor) infrastructure. otp_challenges tracks a 2Factor session
-- per OTP request; profiles.twofa_enabled gates login 2FA per user. Only the
-- edge function (service role) touches otp_challenges — no client policies.
create table if not exists public.otp_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  phone text not null,
  purpose text not null check (purpose in ('login_2fa', 'password_reset')),
  session_id text not null,
  verified boolean not null default false,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes')
);
create index if not exists idx_otp_challenges_user on public.otp_challenges (user_id, created_at desc);
alter table public.otp_challenges enable row level security;
alter table public.profiles add column if not exists twofa_enabled boolean not null default false;
