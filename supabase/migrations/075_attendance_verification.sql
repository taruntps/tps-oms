-- 075: attendance face verification support (applied via MCP 2026-07-11)
-- 1. Verification status on each punch
alter table attendance_punches
  add column if not exists verification_status text
  check (verification_status in ('verified','no_match','unverified','none'));
-- 2. Private bucket for one reference face per user
insert into storage.buckets (id, name, public) values ('face-refs','face-refs', false)
  on conflict (id) do nothing;
-- 3. RLS: user manages own reference; admins read all (edge fns use service role)
drop policy if exists "face_refs_own_rw" on storage.objects;
create policy "face_refs_own_rw" on storage.objects for all to authenticated
  using (bucket_id='face-refs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id='face-refs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "face_refs_admin_read" on storage.objects;
create policy "face_refs_admin_read" on storage.objects for select to authenticated
  using (bucket_id='face-refs' and has_role('super_admin','director','manager'));
-- 4. Threshold: old cosine slider (0.3-0.8) -> Rekognition % (default 0.90)
update attendance_settings set face_match_threshold = 0.90
  where face_match_threshold is null or face_match_threshold < 1.0;
