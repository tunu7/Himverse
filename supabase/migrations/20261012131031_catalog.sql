-- Tourism catalogue: destinations (admin-curated) and experiences
-- (provider-managed). ADR-0002 sections 4 and 5.
--
-- An experience is publicly visible only when ALL hold, evaluated live:
--   experience.status = 'published'
--   provider.status   = 'verified'
--   destination.is_published
-- Setting status = 'published' is only accepted while the provider is
-- verified and the destination is published. Suspending a provider or
-- unpublishing a destination hides its experiences immediately.

create type public.experience_status as enum ('draft', 'published', 'archived');

-- Initial categories; extend with a migration when the product needs more.
create type public.experience_category as enum (
  'culture', 'nature', 'adventure', 'trekking', 'wildlife', 'food_and_drink', 'festivals', 'wellness', 'other'
);

-- ---------------------------------------------------------------------------
-- destinations
-- ---------------------------------------------------------------------------

create table public.destinations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    constraint destinations_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 60),
  name text not null
    constraint destinations_name_length check (char_length(btrim(name)) between 2 and 120),
  district text not null
    constraint destinations_district_length check (char_length(btrim(district)) between 2 and 80),
  summary text not null default ''
    constraint destinations_summary_length check (char_length(summary) <= 500),
  description text not null default ''
    constraint destinations_description_length check (char_length(description) <= 8000),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger destinations_set_updated_at
  before update on public.destinations
  for each row execute function private.set_updated_at();

alter table public.destinations enable row level security;

revoke all on public.destinations from anon, authenticated;
grant select on public.destinations to anon, authenticated;
grant insert (slug, name, district, summary, description, is_published) on public.destinations to authenticated;
grant update (slug, name, district, summary, description, is_published) on public.destinations to authenticated;
grant delete on public.destinations to authenticated;

create function private.is_destination_published(p_destination_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.destinations d
    where d.id = p_destination_id
      and d.is_published
  );
$$;

revoke all on function private.is_destination_published(uuid) from public;
grant execute on function private.is_destination_published(uuid) to anon, authenticated;

create policy "public reads published destinations"
  on public.destinations for select to anon, authenticated
  using (is_published);

create policy "admins read all destinations"
  on public.destinations for select to authenticated
  using ((select private.has_role('admin')));

create policy "admins create destinations"
  on public.destinations for insert to authenticated
  with check ((select private.has_role('admin')));

create policy "admins update destinations"
  on public.destinations for update to authenticated
  using ((select private.has_role('admin')))
  with check ((select private.has_role('admin')));

create policy "admins delete destinations"
  on public.destinations for delete to authenticated
  using ((select private.has_role('admin')));

-- ---------------------------------------------------------------------------
-- experiences
-- ---------------------------------------------------------------------------

create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  destination_id uuid not null references public.destinations (id) on delete restrict,
  slug text not null unique
    constraint experiences_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 80),
  title text not null
    constraint experiences_title_length check (char_length(btrim(title)) between 3 and 140),
  summary text not null default ''
    constraint experiences_summary_length check (char_length(summary) <= 500),
  description text not null default ''
    constraint experiences_description_length check (char_length(description) <= 8000),
  category public.experience_category not null,
  -- 15 minutes to 30 days.
  duration_minutes integer not null
    constraint experiences_duration_range check (duration_minutes between 15 and 43200),
  -- Indicative "from" price in minor units (paise). Never a booking quote.
  price_from_minor integer
    constraint experiences_price_non_negative check (price_from_minor is null or price_from_minor >= 0),
  currency text not null default 'INR'
    constraint experiences_currency_inr check (currency = 'INR'),
  status public.experience_status not null default 'draft',
  published_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index experiences_provider_id_idx on public.experiences (provider_id);
create index experiences_destination_id_idx on public.experiences (destination_id);
create index experiences_status_idx on public.experiences (status);
create index experiences_created_by_idx on public.experiences (created_by);

create function private.set_experience_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at = now();
  end if;
  return new;
end;
$$;

create trigger experiences_set_published_at
  before insert or update on public.experiences
  for each row execute function private.set_experience_published_at();

create trigger experiences_set_updated_at
  before update on public.experiences
  for each row execute function private.set_updated_at();

alter table public.experiences enable row level security;

revoke all on public.experiences from anon, authenticated;
grant select on public.experiences to anon, authenticated;
-- provider_id is insertable (checked by policy) but never updatable, so an
-- experience cannot be moved to another provider. published_at/created_by
-- are system-managed.
grant insert (provider_id, destination_id, slug, title, summary, description, category, duration_minutes, price_from_minor, status)
  on public.experiences to authenticated;
grant update (destination_id, slug, title, summary, description, category, duration_minutes, price_from_minor, status)
  on public.experiences to authenticated;
-- No delete grant: experiences are archived, not deleted.

create policy "public reads live experiences"
  on public.experiences for select to anon, authenticated
  using (
    status = 'published'
    and private.is_provider_verified(provider_id)
    and private.is_destination_published(destination_id)
  );

create policy "members read own provider experiences"
  on public.experiences for select to authenticated
  using (private.is_provider_member(provider_id));

create policy "admins read all experiences"
  on public.experiences for select to authenticated
  using ((select private.has_role('admin')));

create policy "members create experiences for own provider"
  on public.experiences for insert to authenticated
  with check (
    private.is_provider_member(provider_id)
    and (
      status <> 'published'
      or (private.is_provider_verified(provider_id) and private.is_destination_published(destination_id))
    )
  );

create policy "members update own provider experiences"
  on public.experiences for update to authenticated
  using (private.is_provider_member(provider_id))
  with check (
    private.is_provider_member(provider_id)
    and (
      status <> 'published'
      or (private.is_provider_verified(provider_id) and private.is_destination_published(destination_id))
    )
  );

create policy "admins update experiences"
  on public.experiences for update to authenticated
  using ((select private.has_role('admin')))
  with check (
    (select private.has_role('admin'))
    and (
      status <> 'published'
      or (private.is_provider_verified(provider_id) and private.is_destination_published(destination_id))
    )
  );
