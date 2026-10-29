-- Per-visitor and per-identifier request limits for sign-in, sign-up, email
-- sends and phone codes (ADR-0011).
--
-- Supabase Auth limits by IP, but our auth calls come from the server, so it
-- sees the server's IP and every visitor shares one budget. The app counts
-- requests here first, keyed by the visitor's IP (from Vercel's trusted
-- header), the normalised email or phone number, or a platform-wide key (the
-- daily SMS budget).
--
-- Keys arrive as SHA-256 hex digests: no raw IPs, emails or phone numbers are
-- stored. Counting is a fixed window per (bucket, key), updated atomically by
-- an upsert, so concurrent requests can't slip past the limit.
--
-- Only the server's privileged path (service_role) can call the function: if
-- browsers could, anyone could exhaust someone else's per-email budget.

create table private.request_rate_limits (
  bucket text not null constraint request_rate_limits_bucket check (bucket ~ '^[a-z][a-z0-9_]{0,39}$'),
  key_hash text not null constraint request_rate_limits_key check (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  hits integer not null default 1 constraint request_rate_limits_hits check (hits >= 1),
  primary key (bucket, key_hash, window_start)
);

create index request_rate_limits_window_idx on private.request_rate_limits (window_start);

-- Not exposed through the API (private schema); RLS on with no policies as defence in depth.
alter table private.request_rate_limits enable row level security;
revoke all on private.request_rate_limits from public, anon, authenticated;

-- Counts one request and reports whether it is within the limit, and if not,
-- how many seconds until the window ends. Every call counts, including refused
-- ones, so hammering doesn't reset anything.
create function public.hit_rate_limit(
  p_bucket text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_hits integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100000 then
    raise exception 'limit must be between 1 and 100000' using errcode = '22023';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'window must be between 1 second and 1 day' using errcode = '22023';
  end if;

  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into private.request_rate_limits (bucket, key_hash, window_start)
  values (p_bucket, p_key_hash, v_start)
  on conflict (bucket, key_hash, window_start)
    do update set hits = private.request_rate_limits.hits + 1
  returning hits into v_hits;

  return query select
    v_hits <= p_limit,
    greatest(1, ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds) - now()))))::integer;
end;
$$;

revoke all on function public.hit_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, text, integer, integer) to service_role;

-- Expired windows are dropped hourly (the longest window is a day).
create function private.prune_request_rate_limits()
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from private.request_rate_limits where window_start < now() - interval '2 days' returning 1
  )
  select count(*)::integer from gone;
$$;
revoke all on function private.prune_request_rate_limits() from public, anon, authenticated;

select cron.schedule('himverse-prune-rate-limits', '17 * * * *', 'select private.prune_request_rate_limits()');
