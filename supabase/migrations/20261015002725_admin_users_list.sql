-- Admin console: a read-only list of accounts (dashboards phase).
--
-- Admins need to find an account (support, the lost-authenticator runbook,
-- reviewing who runs a business), which needs the sign-in email and dates from
-- auth.users. API roles can't read auth.users, so this security definer
-- function returns a fixed set of columns, only to admins who passed two-step
-- login (has_role requires aal2). It changes nothing.

create function public.admin_list_users(
  p_query text default null,
  p_account_type public.account_type default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  email text,
  display_name text,
  account_type public.account_type,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed boolean,
  two_step boolean,
  business_names text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if not private.has_role('admin') then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  if char_length(coalesce(v_query, '')) > 100 then
    raise exception 'search is too long' using errcode = '22023';
  end if;

  return query
  select
    u.id,
    u.email::text,
    p.display_name,
    p.account_type,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at is not null,
    exists (
      select 1 from auth.mfa_factors f
      where f.user_id = u.id and f.factor_type = 'totp' and f.status = 'verified'
    ),
    (
      select string_agg(pr.display_name, ', ' order by pr.display_name)
      from public.provider_members m
      join public.providers pr on pr.id = m.provider_id
      where m.user_id = u.id
    ),
    count(*) over ()
  from auth.users u
  join public.profiles p on p.id = u.id
  where (p_account_type is null or p.account_type = p_account_type)
    and (
      v_query is null
      or u.email ilike '%' || replace(replace(v_query, '%', '\%'), '_', '\_') || '%'
      or p.display_name ilike '%' || replace(replace(v_query, '%', '\%'), '_', '\_') || '%'
    )
  order by u.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.admin_list_users(text, public.account_type, integer, integer) from public, anon;
grant execute on function public.admin_list_users(text, public.account_type, integer, integer) to authenticated;
