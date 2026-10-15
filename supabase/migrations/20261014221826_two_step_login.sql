-- Two-step login for admins and partners (ADR-0007, Phase 2).
--
-- Admin and provider authority now require a session that has passed a
-- second factor (Supabase MFA, TOTP): the JWT's `aal` claim must be "aal2".
-- The app sends admins and partners through /mfa/setup or /mfa/verify first;
-- this makes the database refuse an aal1 session even if the app is bypassed
-- (for example a stolen password used directly against the API).
--
-- Travellers are unaffected. Conflict-of-interest checks (belongs_to_provider)
-- deliberately ignore the level: they restrict, they don't grant.

create function private.has_second_factor()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2';
$$;

-- Called only from security definer helpers: not executable by API roles.
revoke all on function private.has_second_factor() from public, anon, authenticated;

create or replace function private.has_role(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_second_factor()
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role = p_role
    );
$$;

create or replace function private.is_provider_member(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_second_factor()
    and exists (
      select 1
      from public.provider_members pm
      join public.profiles p on p.id = pm.user_id
      where pm.provider_id = p_provider_id
        and pm.user_id = (select auth.uid())
        and p.account_type = 'partner'
    );
$$;

-- Applying and submitting are partner actions too: they change what admins
-- review, so they need the second step like the rest of the portal.
create function private.require_second_factor_for_partner_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Owner-run SQL has no JWT: leave it alone.
  if (select auth.uid()) is not null and not private.has_second_factor() then
    raise exception 'two-step login required' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.require_second_factor_for_partner_writes() from public, anon, authenticated;

create trigger providers_require_second_factor
  before insert or update on public.providers
  for each row execute function private.require_second_factor_for_partner_writes();
