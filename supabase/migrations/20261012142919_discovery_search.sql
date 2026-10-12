-- Phase 2 discovery: full-text search and filter indexes.
--
-- Search uses generated tsvector columns queried with websearch_to_tsquery via
-- supabase-js textSearch(), so user text is always a bound parameter, never
-- PostgREST filter syntax. Visibility is unchanged: RLS still decides which
-- rows anonymous visitors can see (ADR-0002).

alter table public.experiences
  add column search_vector tsvector
  generated always as (
    to_tsvector('english'::regconfig, title || ' ' || summary || ' ' || description)
  ) stored;

alter table public.destinations
  add column search_vector tsvector
  generated always as (
    to_tsvector('english'::regconfig, name || ' ' || district || ' ' || summary || ' ' || description)
  ) stored;

create index experiences_search_vector_idx on public.experiences using gin (search_vector);
create index destinations_search_vector_idx on public.destinations using gin (search_vector);

-- Filters and sorts used by /experiences and /destinations.
create index experiences_price_from_minor_idx on public.experiences (price_from_minor);
create index experiences_duration_minutes_idx on public.experiences (duration_minutes);
create index experiences_published_at_idx on public.experiences (published_at desc);
create index destinations_district_idx on public.destinations (district);

-- experiences uses column-level select grants (security hardening L2), so the
-- new column must be granted explicitly to be usable in a filter. destinations
-- keeps its table-level select grant. Both are covered by privileges.test.sql.
grant select (search_vector) on public.experiences to anon, authenticated;
