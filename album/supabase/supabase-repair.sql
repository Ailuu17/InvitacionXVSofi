-- Run in the Supabase SQL Editor for the project configured in supabase-config.js.
-- Repairs the grants and Storage bucket required by the shared album uploads.

grant select on table public.album_admins to anon, authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'album-photos',
  'album-photos',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
