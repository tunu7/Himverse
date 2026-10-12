-- Security hardening from the Phase 1 security review (see
-- reports/tasks/2026-10-12-phase1-identity-authorization.md).
--
-- M1  Admin moderation of an experience sticks: when an admin unpublishes or
--     archives an experience it becomes moderation_locked, and provider
--     members cannot publish it again. Only an admin publishing it clears the
--     lock.
-- M2  Provider identity checked in review cannot change underneath the
--     reviewer: private details are editable only in draft/rejected, and the
--     public profile is frozen while pending_review.
-- L1  Text columns whose length check used btrim() also require no
--     leading/trailing spaces, so padding cannot bypass the length limit.
-- L2  created_by and actor_id (user ids) are no longer selectable by API roles.
-- L3  The identity sequence of provider_status_events loses default grants.

-- ---------------------------------------------------------------------------
-- M1: moderation lock on experiences
-- ---------------------------------------------------------------------------

-- Not in any grant: only the trigger below changes it.
alter table public.experiences
  add column moderation_locked boolean not null default false;

create function private.enforce_experience_moderation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- An admin who belongs to the provider is treated as a member (conflict of interest).
  v_moderator boolean := private.has_role('admin') and not private.is_provider_member(new.provider_id);
begin
  if v_moderator then
    if new.status is distinct from old.status then
      new.moderation_locked := new.status <> 'published';
    end if;
  elsif old.moderation_locked and new.status = 'published' then
    raise exception 'experience is locked by moderation' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_experience_moderation() from public, anon, authenticated;

-- Named to sort before experiences_set_published_at (BEFORE triggers fire alphabetically).
create trigger experiences_enforce_moderation
  before update on public.experiences
  for each row execute function private.enforce_experience_moderation();

-- ---------------------------------------------------------------------------
-- M2: freeze reviewed provider identity
-- ---------------------------------------------------------------------------

create function private.provider_accepts_detail_changes(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.providers p
    where p.id = p_provider_id
      and p.status in ('draft', 'rejected')
  );
$$;

revoke all on function private.provider_accepts_detail_changes(uuid) from public;
grant execute on function private.provider_accepts_detail_changes(uuid) to authenticated;

drop policy "members update own private details" on public.provider_private_details;
create policy "members update own private details before review"
  on public.provider_private_details for update to authenticated
  using (
    private.is_provider_member(provider_id)
    and private.provider_accepts_detail_changes(provider_id)
  )
  with check (
    private.is_provider_member(provider_id)
    and private.provider_accepts_detail_changes(provider_id)
  );

drop policy "members update own provider profile" on public.providers;
create policy "members update own provider profile outside review"
  on public.providers for update to authenticated
  using (private.is_provider_member(id) and status <> 'pending_review')
  with check (private.is_provider_member(id) and status <> 'pending_review');

-- ---------------------------------------------------------------------------
-- L1: no whitespace padding around length-checked text
-- ---------------------------------------------------------------------------

alter table public.profiles
  add constraint profiles_display_name_trimmed check (display_name = btrim(display_name));
alter table public.providers
  add constraint providers_display_name_trimmed check (display_name = btrim(display_name)),
  add constraint providers_district_trimmed check (district = btrim(district));
alter table public.provider_private_details
  add constraint provider_private_details_legal_name_trimmed check (legal_name = btrim(legal_name));
alter table public.destinations
  add constraint destinations_name_trimmed check (name = btrim(name)),
  add constraint destinations_district_trimmed check (district = btrim(district));
alter table public.experiences
  add constraint experiences_title_trimmed check (title = btrim(title));

-- ---------------------------------------------------------------------------
-- L2: column-level select grants without user ids
-- ---------------------------------------------------------------------------

revoke select on public.providers from anon, authenticated;
grant select (id, slug, display_name, description, district, status, verified_at, created_at, updated_at)
  on public.providers to anon, authenticated;

revoke select on public.experiences from anon, authenticated;
grant select (
  id, provider_id, destination_id, slug, title, summary, description, category, duration_minutes,
  price_from_minor, currency, status, published_at, moderation_locked, created_at, updated_at
) on public.experiences to anon, authenticated;

revoke select on public.provider_status_events from authenticated;
grant select (id, provider_id, from_status, to_status, note, created_at)
  on public.provider_status_events to authenticated;

-- ---------------------------------------------------------------------------
-- L3: sequences
-- ---------------------------------------------------------------------------

revoke all on sequence public.provider_status_events_id_seq from anon, authenticated;

-- Trigger-only functions: drop Postgres' default PUBLIC execute (defence in depth).
revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.set_experience_published_at() from public, anon, authenticated;
