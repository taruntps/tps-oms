-- 133 — Ready-to-send presets for WhatsApp marketing templates. Stores per-template
-- default values so an admin only adds recipients (phone + name): the event text ({{2}}…)
-- and any PDF/image header are pre-filled from here. {{1}} is always the recipient's name.
create table if not exists public.wa_template_presets (
  template_name text primary key,
  extra_vars    text not null default '',   -- pipe-separated values for {{2}}, {{3}}, …
  doc_url       text,                        -- default PDF for a Document-header template
  doc_filename  text,
  image_url     text,                        -- default image for an Image-header template
  updated_at    timestamptz not null default now()
);
alter table public.wa_template_presets enable row level security;
drop policy if exists wa_template_presets_read on public.wa_template_presets;
create policy wa_template_presets_read on public.wa_template_presets
  for select using (auth.uid() is not null);
drop policy if exists wa_template_presets_write on public.wa_template_presets;
create policy wa_template_presets_write on public.wa_template_presets
  for all using (auth_role() in ('super_admin','director'))
  with check (auth_role() in ('super_admin','director'));

-- Seed the 4 approved MARKETING templates so they are send-ready.
insert into public.wa_template_presets (template_name, extra_vars, doc_url, doc_filename) values
  ('tps_intro',          '',           null, null),
  ('tps_intro_named',    '',           'https://portal.tpsxpert.com/tps-brochure.pdf', 'TPS Xperts Group Profile.pdf'),
  ('tps_expo',           'IPHEX 2026', null, null),
  ('tps_expo_thankyou',  'IPHEX 2026', 'https://portal.tpsxpert.com/tps-brochure.pdf', 'TPS Xperts Group Profile.pdf')
on conflict (template_name) do nothing;
