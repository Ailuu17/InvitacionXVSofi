-- Run once in the Supabase SQL Editor. Then create the administrator account
-- in Authentication > Users and add its user ID to public.album_admins:
-- insert into public.album_admins (user_id) values ('<AUTH_USER_UUID>'::uuid);
create table public.album_photos (
  id text primary key,
  storage_path text not null unique,
  author text not null check (char_length(btrim(author)) between 1 and 100),
  category text not null check (category in (
    'Fiesta & Baile',
    'Quinceañera',
    'Con Sofía',
    'Fotos Grupales',
    'Momentos Inolvidables'
  )),
  caption text not null default '' check (char_length(caption) <= 500),
  likes integer not null default 0 check (likes >= 0),
  timestamp timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'archived'))
);

alter table public.album_photos enable row level security;
grant select, insert on public.album_photos to anon, authenticated;
grant update, delete on public.album_photos to authenticated;

create table public.album_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.album_admins enable row level security;
revoke all on public.album_admins from anon, authenticated;
grant select on public.album_admins to anon, authenticated;

create policy "Admins can verify own membership"
  on public.album_admins for select to authenticated
  using (user_id = auth.uid());

create policy "Anyone can read active album photos"
  on public.album_photos for select to anon, authenticated
  using (
    status = 'active'
    or exists (
      select 1 from public.album_admins
      where user_id = auth.uid()
    )
  );

create policy "Anyone can upload active album photos"
  on public.album_photos for insert to anon, authenticated
  with check (status = 'active');

create policy "Admins can update album photos"
  on public.album_photos for update to authenticated
  using (
    exists (
      select 1 from public.album_admins
      where user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.album_admins
      where user_id = auth.uid()
    )
  );

create policy "Admins can delete album photos"
  on public.album_photos for delete to authenticated
  using (
    exists (
      select 1 from public.album_admins
      where user_id = auth.uid()
    )
  );

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

create policy "Anyone can view album photo files"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'album-photos');

create policy "Anyone can upload album photo files"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'album-photos');

create policy "Admins can delete album photo files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'album-photos'
    and exists (
      select 1 from public.album_admins
      where user_id = auth.uid()
    )
  );

alter publication supabase_realtime add table public.album_photos;
