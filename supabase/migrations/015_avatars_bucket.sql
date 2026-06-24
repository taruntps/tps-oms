-- Migration 015: public avatars bucket for profile photos
-- Users upload their own avatar (path: avatars/<user_id>/<file>); anyone can read
-- (public bucket) so the image renders without signed URLs. profiles.avatar_url
-- already exists to store the public URL.

insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 3145728)  -- 3 MB cap
on conflict (id) do update set public = true, file_size_limit = 3145728;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
