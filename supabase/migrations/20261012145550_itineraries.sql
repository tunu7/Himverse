-- Phase 3: AI itinerary generation (ADR-0003).
--
-- Itineraries are private to their owner; there is no sharing. Versions and
-- items are immutable records of validated generations. They are written ONLY
-- through save_itinerary_version(), which:
--   * checks ownership with auth.uid(),
--   * re-checks that every referenced experience is publicly visible right now
--     (published + verified provider + published destination), so model output
--     or a forged request can never reference hidden inventory,
--   * snapshots title, price and duration from the database (never from the
--     client or the model) and computes the estimated total itself.
-- itinerary_generations logs every model-calling attempt (no prompt text, no
-- personal data) for rate limiting and observability.

create type public.itinerary_time_of_day as enum ('morning', 'afternoon', 'evening', 'full_day');
create type public.itinerary_version_kind as enum ('generate', 'refine', 'regenerate');
create type public.itinerary_generation_outcome as enum (
  'succeeded', 'failed_validation', 'failed_upstream', 'failed_timeout', 'failed_save'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.itineraries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null
    constraint itineraries_title_length check (char_length(title) between 1 and 120 and title = btrim(title)),
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index itineraries_owner_updated_idx on public.itineraries (owner_id, updated_at desc);

create table public.itinerary_versions (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references public.itineraries (id) on delete cascade,
  version_number integer not null constraint itinerary_versions_number_positive check (version_number > 0),
  kind public.itinerary_version_kind not null,
  preferences jsonb not null
    constraint itinerary_versions_preferences_shape check (
      jsonb_typeof(preferences) = 'object' and octet_length(preferences::text) <= 8000
    ),
  plan jsonb not null
    constraint itinerary_versions_plan_shape check (
      jsonb_typeof(plan) = 'object' and octet_length(plan::text) <= 100000
    ),
  schema_version text not null
    constraint itinerary_versions_schema_version_format check (schema_version ~ '^itinerary\.v[0-9]{1,3}$'),
  prompt_version text not null
    constraint itinerary_versions_prompt_version_length check (char_length(prompt_version) between 1 and 40),
  model text not null
    constraint itinerary_versions_model_length check (char_length(model) between 1 and 100),
  travelers integer not null constraint itinerary_versions_travelers_range check (travelers between 1 and 12),
  -- Computed in save_itinerary_version from database prices (per person x travelers).
  estimated_total_minor bigint not null
    constraint itinerary_versions_total_non_negative check (estimated_total_minor >= 0),
  unpriced_item_count integer not null
    constraint itinerary_versions_unpriced_non_negative check (unpriced_item_count >= 0),
  currency text not null default 'INR' constraint itinerary_versions_currency_inr check (currency = 'INR'),
  warnings jsonb not null default '[]'
    constraint itinerary_versions_warnings_shape check (
      jsonb_typeof(warnings) = 'array' and octet_length(warnings::text) <= 20000
    ),
  created_at timestamptz not null default now(),
  constraint itinerary_versions_number_unique unique (itinerary_id, version_number),
  -- Target for the composite FK below (current version must belong to the same itinerary).
  constraint itinerary_versions_id_itinerary_unique unique (id, itinerary_id)
);

-- current_version_id must point at a version of the SAME itinerary. Deferred so an
-- itinerary and its versions can be deleted together.
alter table public.itineraries
  add constraint itineraries_current_version_fk
  foreign key (current_version_id, id) references public.itinerary_versions (id, itinerary_id)
  deferrable initially deferred;

create table public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.itinerary_versions (id) on delete cascade,
  day_number integer not null constraint itinerary_items_day_range check (day_number between 1 and 14),
  position integer not null constraint itinerary_items_position_range check (position between 1 and 8),
  -- Catalogue rows may later be hidden or removed; snapshots keep old versions readable.
  experience_id uuid references public.experiences (id) on delete set null,
  destination_id uuid references public.destinations (id) on delete set null,
  experience_title_snapshot text not null
    constraint itinerary_items_title_length check (char_length(experience_title_snapshot) between 1 and 140),
  destination_name_snapshot text not null
    constraint itinerary_items_destination_length check (char_length(destination_name_snapshot) between 1 and 120),
  time_of_day public.itinerary_time_of_day not null,
  rationale text not null default ''
    constraint itinerary_items_rationale_length check (char_length(rationale) <= 500),
  price_snapshot_minor integer
    constraint itinerary_items_price_non_negative check (price_snapshot_minor is null or price_snapshot_minor >= 0),
  duration_snapshot_minutes integer not null
    constraint itinerary_items_duration_positive check (duration_snapshot_minutes > 0),
  constraint itinerary_items_slot_unique unique (version_id, day_number, position)
);

create index itinerary_items_experience_id_idx on public.itinerary_items (experience_id);
create index itinerary_items_destination_id_idx on public.itinerary_items (destination_id);

create table public.itinerary_generations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  itinerary_id uuid references public.itineraries (id) on delete set null,
  outcome public.itinerary_generation_outcome not null,
  error_code text constraint itinerary_generations_error_code_length check (char_length(error_code) <= 60),
  model text constraint itinerary_generations_model_length check (char_length(model) <= 100),
  prompt_version text constraint itinerary_generations_prompt_version_length check (char_length(prompt_version) <= 40),
  latency_ms integer constraint itinerary_generations_latency_non_negative check (latency_ms >= 0),
  input_tokens integer constraint itinerary_generations_input_tokens_non_negative check (input_tokens >= 0),
  output_tokens integer constraint itinerary_generations_output_tokens_non_negative check (output_tokens >= 0),
  created_at timestamptz not null default now()
);

create index itinerary_generations_user_created_idx on public.itinerary_generations (user_id, created_at desc);
create index itinerary_generations_itinerary_id_idx on public.itinerary_generations (itinerary_id);

create trigger itineraries_set_updated_at
  before update on public.itineraries
  for each row execute function private.set_updated_at();

alter table public.itineraries enable row level security;
alter table public.itinerary_versions enable row level security;
alter table public.itinerary_items enable row level security;
alter table public.itinerary_generations enable row level security;

-- ---------------------------------------------------------------------------
-- Privileges: owners read; title/current version editable; writes via RPC only
-- ---------------------------------------------------------------------------

revoke all on public.itineraries from anon, authenticated;
grant select, delete on public.itineraries to authenticated;
grant update (title, current_version_id) on public.itineraries to authenticated;

revoke all on public.itinerary_versions from anon, authenticated;
grant select on public.itinerary_versions to authenticated;

revoke all on public.itinerary_items from anon, authenticated;
grant select on public.itinerary_items to authenticated;

revoke all on public.itinerary_generations from anon, authenticated;
grant select on public.itinerary_generations to authenticated;
revoke all on sequence public.itinerary_generations_id_seq from anon, authenticated;

create function private.owns_itinerary(p_itinerary_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.itineraries i
    where i.id = p_itinerary_id and i.owner_id = (select auth.uid())
  );
$$;

revoke all on function private.owns_itinerary(uuid) from public;
grant execute on function private.owns_itinerary(uuid) to authenticated;

create policy "owners read own itineraries"
  on public.itineraries for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "owners update own itineraries"
  on public.itineraries for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "owners delete own itineraries"
  on public.itineraries for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "owners read own itinerary versions"
  on public.itinerary_versions for select to authenticated
  using (private.owns_itinerary(itinerary_id));

create policy "owners read own itinerary items"
  on public.itinerary_items for select to authenticated
  using (
    exists (
      select 1 from public.itinerary_versions v
      where v.id = version_id and private.owns_itinerary(v.itinerary_id)
    )
  );

create policy "users read own generation log"
  on public.itinerary_generations for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- RPCs
--
-- Error codes (mapped in src/server/itineraries/repository.ts):
--   42501 authentication required           P0002 itinerary not found / not owned
--   55000 referenced inventory not public    22023 invalid argument
-- ---------------------------------------------------------------------------

create function public.save_itinerary_version(
  p_itinerary_id uuid,
  p_title text,
  p_kind public.itinerary_version_kind,
  p_preferences jsonb,
  p_plan jsonb,
  p_schema_version text,
  p_prompt_version text,
  p_model text,
  p_travelers integer,
  p_warnings jsonb,
  p_items jsonb
)
returns table (itinerary_id uuid, version_id uuid, version_number integer, estimated_total_minor bigint, unpriced_item_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_itinerary_id uuid := p_itinerary_id;
  v_version_id uuid;
  v_version_number integer;
  v_item_count integer;
  v_valid_count integer;
  v_total bigint;
  v_unpriced integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;
  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 60 then
    raise exception 'an itinerary needs between 1 and 60 items' using errcode = '22023';
  end if;
  if p_travelers is null or p_travelers < 1 or p_travelers > 12 then
    raise exception 'travelers must be between 1 and 12' using errcode = '22023';
  end if;

  if v_itinerary_id is null then
    insert into public.itineraries (owner_id, title)
    values (v_user_id, btrim(p_title))
    returning id into v_itinerary_id;
  else
    perform 1 from public.itineraries i
    where i.id = v_itinerary_id and i.owner_id = v_user_id
    for update;
    if not found then
      -- Same answer whether missing or someone else's: no existence oracle.
      raise exception 'itinerary not found' using errcode = 'P0002';
    end if;
  end if;

  -- Every referenced experience must be publicly visible now, at the stated destination.
  select count(*) into v_valid_count
  from jsonb_to_recordset(p_items) as x(experience_id uuid, destination_id uuid)
  join public.experiences e on e.id = x.experience_id and e.destination_id = x.destination_id
  where e.status = 'published'
    and private.is_provider_verified(e.provider_id)
    and private.is_destination_published(e.destination_id);
  if v_valid_count <> v_item_count then
    raise exception 'one or more experiences are not available' using errcode = '55000';
  end if;

  select coalesce(max(v.version_number), 0) + 1 into v_version_number
  from public.itinerary_versions v where v.itinerary_id = v_itinerary_id;

  select
    coalesce(sum(e.price_from_minor), 0) * p_travelers,
    count(*) filter (where e.price_from_minor is null)
  into v_total, v_unpriced
  from jsonb_to_recordset(p_items) as x(experience_id uuid)
  join public.experiences e on e.id = x.experience_id;

  insert into public.itinerary_versions (
    itinerary_id, version_number, kind, preferences, plan, schema_version, prompt_version, model,
    travelers, estimated_total_minor, unpriced_item_count, warnings
  )
  values (
    v_itinerary_id, v_version_number, p_kind, p_preferences, p_plan, p_schema_version, p_prompt_version,
    p_model, p_travelers, v_total, v_unpriced, coalesce(p_warnings, '[]'::jsonb)
  )
  returning id into v_version_id;

  insert into public.itinerary_items (
    version_id, day_number, position, experience_id, destination_id, experience_title_snapshot,
    destination_name_snapshot, time_of_day, rationale, price_snapshot_minor, duration_snapshot_minutes
  )
  select
    v_version_id, x.day_number, x.position, e.id, d.id, e.title, d.name, x.time_of_day,
    left(coalesce(x.rationale, ''), 500), e.price_from_minor, e.duration_minutes
  from jsonb_to_recordset(p_items) as x(
    day_number integer, position integer, experience_id uuid, time_of_day public.itinerary_time_of_day, rationale text
  )
  join public.experiences e on e.id = x.experience_id
  join public.destinations d on d.id = e.destination_id;

  update public.itineraries i
  set current_version_id = v_version_id
  where i.id = v_itinerary_id;

  return query select v_itinerary_id, v_version_id, v_version_number, v_total, v_unpriced;
end;
$$;

create function public.record_itinerary_generation(
  p_itinerary_id uuid,
  p_outcome public.itinerary_generation_outcome,
  p_error_code text,
  p_model text,
  p_prompt_version text,
  p_latency_ms integer,
  p_input_tokens integer,
  p_output_tokens integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  insert into public.itinerary_generations (
    user_id, itinerary_id, outcome, error_code, model, prompt_version, latency_ms, input_tokens, output_tokens
  )
  values (
    v_user_id,
    -- Only link itineraries the caller owns.
    case when p_itinerary_id is not null and private.owns_itinerary(p_itinerary_id) then p_itinerary_id end,
    p_outcome,
    left(p_error_code, 60),
    left(p_model, 100),
    left(p_prompt_version, 40),
    greatest(p_latency_ms, 0),
    greatest(p_input_tokens, 0),
    greatest(p_output_tokens, 0)
  );
end;
$$;

revoke all on function public.save_itinerary_version(uuid, text, public.itinerary_version_kind, jsonb, jsonb, text, text, text, integer, jsonb, jsonb) from public, anon;
revoke all on function public.record_itinerary_generation(uuid, public.itinerary_generation_outcome, text, text, text, integer, integer, integer) from public, anon;
grant execute on function public.save_itinerary_version(uuid, text, public.itinerary_version_kind, jsonb, jsonb, text, text, text, integer, jsonb, jsonb) to authenticated;
grant execute on function public.record_itinerary_generation(uuid, public.itinerary_generation_outcome, text, text, text, integer, integer, integer) to authenticated;
