-- Per-account limits on secret-guessing (security review, Phase 2 S2).
--
-- Supabase Auth rate-limits by IP, but every auth call comes from our server,
-- so all users share one budget: guessing isn't limited per account, and one
-- abuser can exhaust it for everyone. These functions count failed attempts
-- per signed-in account and kind (two-step codes, current-password checks).
-- They are keyed only by auth.uid(), so nobody can lock out someone else.

create table private.auth_failures (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null constraint auth_failures_kind check (kind in ('mfa_code', 'current_password')),
  created_at timestamptz not null default now()
);

create index auth_failures_user_kind_time_idx on private.auth_failures (user_id, kind, created_at desc);

-- Not exposed through the API (private schema); RLS on with no policies as defence in depth.
alter table private.auth_failures enable row level security;
revoke all on private.auth_failures from public, anon, authenticated;

-- At most 5 failures per kind in 15 minutes.
create function public.auth_attempt_allowed(p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (
      select count(*) from private.auth_failures f
      where f.user_id = (select auth.uid()) and f.kind = p_kind
        and f.created_at > now() - interval '15 minutes'
    ) < 5;
$$;

create function public.record_auth_failure(p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_kind not in ('mfa_code', 'current_password') then
    raise exception 'unknown attempt kind' using errcode = '22023';
  end if;
  insert into private.auth_failures (user_id, kind) values ((select auth.uid()), p_kind);
  -- Keep the table small: drop this account's entries older than a day.
  delete from private.auth_failures
  where user_id = (select auth.uid()) and created_at < now() - interval '1 day';
end;
$$;

revoke all on function public.auth_attempt_allowed(text) from public, anon;
revoke all on function public.record_auth_failure(text) from public, anon;
grant execute on function public.auth_attempt_allowed(text) to authenticated;
grant execute on function public.record_auth_failure(text) to authenticated;
