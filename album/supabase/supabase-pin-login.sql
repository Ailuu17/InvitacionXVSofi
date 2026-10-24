-- Run once in the Supabase SQL Editor to enable rate limiting for PIN login.
create table if not exists public.album_admin_pin_attempts (
  ip_hash text primary key check (ip_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count > 0)
);

alter table public.album_admin_pin_attempts enable row level security;
revoke all on table public.album_admin_pin_attempts from public, anon, authenticated;
grant all on table public.album_admin_pin_attempts to service_role;
create index if not exists album_admin_pin_attempts_window_idx
  on public.album_admin_pin_attempts (window_started_at);

create or replace function public.consume_album_admin_pin_attempt(p_ip_hash text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt_count integer;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid IP hash';
  end if;

  delete from public.album_admin_pin_attempts
  where window_started_at < now() - interval '30 days';

  insert into public.album_admin_pin_attempts as current_attempts (
    ip_hash,
    window_started_at,
    attempt_count
  )
  values (p_ip_hash, now(), 1)
  on conflict (ip_hash) do update
  set window_started_at = case
        when current_attempts.window_started_at < now() - interval '15 minutes' then now()
        else current_attempts.window_started_at
      end,
      attempt_count = case
        when current_attempts.window_started_at < now() - interval '15 minutes' then 1
        else current_attempts.attempt_count + 1
      end
  returning attempt_count into v_attempt_count;

  return v_attempt_count;
end;
$$;

revoke all on function public.consume_album_admin_pin_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_album_admin_pin_attempt(text) to service_role;
