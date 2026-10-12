-- Roles without access to the `private` schema (e.g. service_role in a future
-- system job) must still be able to update experiences: the moderation trigger
-- runs as its owner (review follow-up L-2).
--
-- Kept in its own file on purpose: PL/pgSQL caches a trigger's expression plans
-- per session, and schema permissions are only checked when the plan is first
-- built. service_role must be the first role to fire the trigger in this session,
-- otherwise a regression to SECURITY INVOKER would go unnoticed.
begin;
create extension if not exists pgtap with schema extensions;

select plan(2);

truncate public.experiences, public.destinations, public.provider_status_events,
  public.provider_private_details, public.provider_members, public.providers;

insert into public.providers (id, slug, display_name, status, verified_at)
values ('10000000-0000-4000-8000-000000000001', 'sys-provider', 'System Provider', 'verified', now());
insert into public.destinations (id, slug, name, district, is_published)
values ('20000000-0000-4000-8000-000000000001', 'ziro', 'Ziro Valley', 'Lower Subansiri', true);
insert into public.experiences (id, provider_id, destination_id, slug, title, category, duration_minutes, status)
values ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001', 'sys-walk', 'System walk', 'culture', 60, 'published');

select ok(
  not has_schema_privilege('service_role', 'private', 'USAGE'),
  'precondition: service_role has no access to the private schema');

set local role service_role;
select lives_ok(
  $$ update public.experiences set summary = 'Updated by a system job'
     where id = '30000000-0000-4000-8000-000000000001' $$,
  'service_role can update experiences (moderation trigger runs as its owner)');
reset role;

select * from finish();
rollback;
