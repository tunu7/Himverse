-- Catalog-level privilege checks. Supabase grants ALL on new objects in
-- `public` to anon/authenticated by default; these tests fail when a new
-- table, function or sequence is added without explicit revokes/grants, or
-- without RLS. Adding an object means adding it here deliberately.
begin;
create extension if not exists pgtap with schema extensions;

select plan(41);

-- Inventory: new objects must be added to these lists (and reviewed) ----------
select tables_are('public', array[
  'profiles', 'user_roles', 'providers', 'provider_members', 'provider_private_details',
  'provider_status_events', 'destinations', 'experiences'
], 'public tables are exactly the reviewed set');

select functions_are('public', array[
  'create_provider_application', 'submit_provider_application', 'review_provider'
], 'public (RPC-exposed) functions are exactly the reviewed set');

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'every public table has RLS enabled');

-- Table-level privileges (column-level grants are checked separately) ----------
select table_privs_are('public', 'profiles', 'anon', array[]::text[], 'anon: no profiles privileges');
select table_privs_are('public', 'profiles', 'authenticated', array['SELECT'], 'authenticated: profiles select only');
select table_privs_are('public', 'user_roles', 'anon', array[]::text[], 'anon: no user_roles privileges');
select table_privs_are('public', 'user_roles', 'authenticated', array['SELECT'], 'authenticated: user_roles select only (no writes)');
select table_privs_are('public', 'providers', 'anon', array[]::text[], 'anon: providers via column grants only');
select table_privs_are('public', 'providers', 'authenticated', array[]::text[], 'authenticated: providers via column grants only');
select table_privs_are('public', 'provider_members', 'anon', array[]::text[], 'anon: no provider_members privileges');
select table_privs_are('public', 'provider_members', 'authenticated', array['SELECT'], 'authenticated: provider_members select only');
select table_privs_are('public', 'provider_private_details', 'anon', array[]::text[], 'anon: no private details privileges');
select table_privs_are('public', 'provider_private_details', 'authenticated', array['SELECT'], 'authenticated: private details select (+ column update)');
select table_privs_are('public', 'provider_status_events', 'anon', array[]::text[], 'anon: no status events privileges');
select table_privs_are('public', 'provider_status_events', 'authenticated', array[]::text[], 'authenticated: status events via column grants only');
select table_privs_are('public', 'destinations', 'anon', array['SELECT'], 'anon: destinations select only');
select table_privs_are('public', 'destinations', 'authenticated', array['SELECT', 'DELETE'], 'authenticated: destinations select/delete (+ column insert/update), admin-only by RLS');
select table_privs_are('public', 'experiences', 'anon', array[]::text[], 'anon: experiences via column grants only');
select table_privs_are('public', 'experiences', 'authenticated', array[]::text[], 'authenticated: experiences via column grants only');

-- Sensitive columns -----------------------------------------------------------
select ok(not has_column_privilege('authenticated', 'public.providers', 'status', 'UPDATE'), 'nobody updates providers.status directly');
select ok(not has_column_privilege('authenticated', 'public.providers', 'verified_at', 'UPDATE'), 'nobody updates providers.verified_at directly');
select ok(not has_column_privilege('authenticated', 'public.providers', 'slug', 'UPDATE'), 'provider slug is immutable');
select ok(not has_column_privilege('authenticated', 'public.experiences', 'provider_id', 'UPDATE'), 'experiences cannot change provider');
select ok(not has_column_privilege('authenticated', 'public.experiences', 'moderation_locked', 'UPDATE'), 'moderation_locked is trigger-managed');
select ok(not has_column_privilege('authenticated', 'public.experiences', 'created_by', 'INSERT'), 'created_by cannot be supplied');
select ok(not has_column_privilege('anon', 'public.providers', 'created_by', 'SELECT'), 'anon cannot read providers.created_by');
select ok(not has_column_privilege('authenticated', 'public.experiences', 'created_by', 'SELECT'), 'authenticated cannot read experiences.created_by');
select ok(not has_column_privilege('authenticated', 'public.provider_status_events', 'actor_id', 'SELECT'), 'actor ids are not readable via the API');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE'), 'profile id is immutable');

-- Sequences ---------------------------------------------------------------------
select is_empty(
  $$ select c.relname, r.rolname
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     cross join (values ('anon'), ('authenticated')) as r(rolname)
     where n.nspname = 'public' and c.relkind = 'S'
       and (has_sequence_privilege(r.rolname, c.oid, 'USAGE')
            or has_sequence_privilege(r.rolname, c.oid, 'SELECT')
            or has_sequence_privilege(r.rolname, c.oid, 'UPDATE')) $$,
  'API roles have no privileges on public sequences');

-- Functions ---------------------------------------------------------------------
select function_privs_are('public', 'create_provider_application',
  array['text', 'text', 'text', 'text', 'text', 'text', 'text'], 'anon', array[]::text[],
  'anon cannot execute create_provider_application');
select function_privs_are('public', 'submit_provider_application', array['uuid'], 'anon', array[]::text[],
  'anon cannot execute submit_provider_application');
select function_privs_are('public', 'review_provider', array['uuid', 'provider_status', 'text'], 'anon', array[]::text[],
  'anon cannot execute review_provider');
select function_privs_are('public', 'review_provider', array['uuid', 'provider_status', 'text'], 'authenticated', array['EXECUTE'],
  'authenticated may call review_provider (admin check is inside)');

select is_empty(
  $$ select p.proname, r.rolname
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join (values ('anon'), ('authenticated')) as r(rolname)
     where n.nspname = 'private'
       and p.prorettype = 'trigger'::regtype
       and has_function_privilege(r.rolname, p.oid, 'EXECUTE') $$,
  'API roles cannot execute trigger functions');

select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c = 'search_path=""') $$,
  'every security definer function pins search_path to empty');

-- Schemas -------------------------------------------------------------------------
select schema_privs_are('private', 'anon', array['USAGE'], 'anon has usage only on private');
select schema_privs_are('private', 'authenticated', array['USAGE'], 'authenticated has usage only on private');

-- Blind spots found in the second security review (M-1) ---------------------------
-- Views run as their owner unless security_invoker, so they could bypass RLS on the
-- underlying tables. None exist; adding one must update this test deliberately.
select is_empty(
  $$ select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v', 'm', 'f') $$,
  'no views, materialized views or foreign tables in public');

-- Exact EXECUTE snapshot for API roles in public and private: catches new functions
-- and new overloads (which inherit Supabase's default EXECUTE grants).
select results_eq(
  $$ select n.nspname::text collate "default",
            format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) collate "default",
            r.rolname
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join (values ('anon'), ('authenticated')) as r(rolname)
     where n.nspname in ('public', 'private') and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
     order by 1, 2, 3 $$,
  $$ values
       ('private', 'has_role(p_role app_role)', 'anon'),
       ('private', 'has_role(p_role app_role)', 'authenticated'),
       ('private', 'is_destination_published(p_destination_id uuid)', 'anon'),
       ('private', 'is_destination_published(p_destination_id uuid)', 'authenticated'),
       ('private', 'is_provider_member(p_provider_id uuid)', 'anon'),
       ('private', 'is_provider_member(p_provider_id uuid)', 'authenticated'),
       ('private', 'is_provider_verified(p_provider_id uuid)', 'anon'),
       ('private', 'is_provider_verified(p_provider_id uuid)', 'authenticated'),
       ('private', 'provider_accepts_detail_changes(p_provider_id uuid)', 'authenticated'),
       ('public', 'create_provider_application(p_slug text, p_display_name text, p_description text, p_district text, p_legal_name text, p_contact_email text, p_contact_phone text)', 'authenticated'),
       ('public', 'review_provider(p_provider_id uuid, p_decision provider_status, p_note text)', 'authenticated'),
       ('public', 'submit_provider_application(p_provider_id uuid)', 'authenticated') $$,
  'API roles can execute exactly the reviewed functions');

-- Exact column-privilege snapshot (includes privileges implied by table grants), so a
-- new column on any table is not silently readable or writable by API roles.
select results_eq(
  $$ select table_name::text collate "default", grantee::text collate "default",
            privilege_type::text collate "default",
            string_agg(column_name::text, ',' order by column_name::text collate "C") collate "default"
     from information_schema.column_privileges
     where table_schema = 'public' and grantee in ('anon', 'authenticated')
     group by 1, 2, 3 order by 1, 2, 3 $$,
  $$ values
       ('destinations', 'anon', 'SELECT', 'created_at,description,district,id,is_published,name,slug,summary,updated_at'),
       ('destinations', 'authenticated', 'INSERT', 'description,district,is_published,name,slug,summary'),
       ('destinations', 'authenticated', 'SELECT', 'created_at,description,district,id,is_published,name,slug,summary,updated_at'),
       ('destinations', 'authenticated', 'UPDATE', 'description,district,is_published,name,slug,summary'),
       ('experiences', 'anon', 'SELECT', 'category,created_at,currency,description,destination_id,duration_minutes,id,moderation_locked,price_from_minor,provider_id,published_at,slug,status,summary,title,updated_at'),
       ('experiences', 'authenticated', 'INSERT', 'category,description,destination_id,duration_minutes,price_from_minor,provider_id,slug,status,summary,title'),
       ('experiences', 'authenticated', 'SELECT', 'category,created_at,currency,description,destination_id,duration_minutes,id,moderation_locked,price_from_minor,provider_id,published_at,slug,status,summary,title,updated_at'),
       ('experiences', 'authenticated', 'UPDATE', 'category,description,destination_id,duration_minutes,price_from_minor,slug,status,summary,title'),
       ('profiles', 'authenticated', 'SELECT', 'created_at,display_name,id,updated_at'),
       ('profiles', 'authenticated', 'UPDATE', 'display_name'),
       ('provider_members', 'authenticated', 'SELECT', 'created_at,member_role,provider_id,user_id'),
       ('provider_private_details', 'authenticated', 'SELECT', 'contact_email,contact_phone,legal_name,provider_id,updated_at'),
       ('provider_private_details', 'authenticated', 'UPDATE', 'contact_email,contact_phone,legal_name'),
       ('provider_status_events', 'authenticated', 'SELECT', 'created_at,from_status,id,note,provider_id,to_status'),
       ('providers', 'anon', 'SELECT', 'created_at,description,display_name,district,id,slug,status,updated_at,verified_at'),
       ('providers', 'authenticated', 'SELECT', 'created_at,description,display_name,district,id,slug,status,updated_at,verified_at'),
       ('providers', 'authenticated', 'UPDATE', 'description,display_name,district'),
       ('user_roles', 'authenticated', 'SELECT', 'granted_at,granted_by,role,user_id') $$,
  'API roles hold exactly the reviewed column privileges');

select * from finish();
rollback;
