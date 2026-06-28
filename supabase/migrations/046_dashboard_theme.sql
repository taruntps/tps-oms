-- Add dashboard_theme preference to profiles
alter table profiles
  add column if not exists dashboard_theme text not null default 'ocean'
  check (dashboard_theme in ('ocean','slate','sand','forest','white'));

comment on column profiles.dashboard_theme is 'User-chosen dashboard colour theme';
