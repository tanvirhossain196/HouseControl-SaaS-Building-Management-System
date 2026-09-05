-- 0016 — profile photos
--
-- A public bucket, because an avatar is shown next to a person's name on
-- every screen their flatmates and their owner already see. Making it private
-- would mean a signed URL per render, and the thing being protected is a
-- face somebody chose to upload.
--
-- What is protected is *writing*: the path always starts with the uploader's
-- own user id, so nobody can overwrite somebody else's photo.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2 * 1024 * 1024,                                   -- 2MB; a face, not a poster
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may look at an avatar.
drop policy if exists "avatars are readable" on storage.objects;

create policy "avatars are readable" on storage.objects
  for select using (bucket_id = 'avatars');

-- You may write only inside your own folder: avatars/<your-user-id>/…
--
-- `storage.foldername(name)` splits the path, so the first segment has to be
-- the caller's id. Without this check a signed-in person could upload over
-- any other person's photo, which is a quiet way to impersonate somebody in
-- a list of residents.
drop policy if exists "own avatar upload" on storage.objects;

create policy "own avatar upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own avatar update" on storage.objects;

create policy "own avatar update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own avatar delete" on storage.objects;

create policy "own avatar delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
