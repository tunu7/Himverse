-- Catalog-level privilege checks. Supabase grants ALL on new objects in
-- `public` to anon/authenticated by default; these tests fail when a new
-- table, function or sequence is added without explicit revokes/grants, or
-- without RLS. Adding an object means adding it here deliberately.
begin;
create extension if not exists pgtap with schema extensions;

select plan(55);

-- Inventory: new objects must be added to these lists (and reviewed) ----------
select tables_are('public', array[
  'profiles', 'user_roles', 'providers', 'provider_members', 'provider_private_details',
  'provider_status_events', 'destinations', 'experiences',
  'itineraries', 'itinerary_versions', 'itinerary_items', 'itinerary_generations',
  'availability_slots', 'bookings', 'booking_events'
], 'public tables are exactly the reviewed set');

select functions_are('public', array[
  'create_provider_application', 'submit_provider_application', 'review_provider',
  'save_itinerary_version', 'begin_itinerary_generation', 'finish_itinerary_generation',
  'request_booking', 'request_booking_on_date', 'request_itinerary_bookings', 'respond_to_booking', 'cancel_booking', 'ai_generations_today'
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
select table_privs_are('public', 'itineraries', 'anon', array[]::text[], 'anon: no itinerary privileges');
select table_privs_are('public', 'itineraries', 'authenticated', array['SELECT', 'DELETE'], 'authenticated: itineraries select/delete (+ column update); inserts via RPC');
select table_privs_are('public', 'itinerary_versions', 'anon', array[]::text[], 'anon: no itinerary version privileges');
select table_privs_are('public', 'itinerary_versions', 'authenticated', array['SELECT'], 'authenticated: itinerary versions read-only (immutable)');
select table_privs_are('public', 'itinerary_items', 'anon', array[]::text[], 'anon: no itinerary item privileges');
select table_privs_are('public', 'itinerary_items', 'authenticated', array['SELECT'], 'authenticated: itinerary items read-only (immutable)');
select table_privs_are('public', 'itinerary_generations', 'anon', array[]::text[], 'anon: no generation log privileges');
select table_privs_are('public', 'itinerary_generations', 'authenticated', array['SELECT'], 'authenticated: generation log read-only; written via RPC');
select table_privs_are('public', 'availability_slots', 'anon', array['SELECT'], 'anon: slots read-only (RLS: open, upcoming, public)');
select table_privs_are('public', 'availability_slots', 'authenticated', array['SELECT'], 'authenticated: slots select (+ column insert/update for members)');
select table_privs_are('public', 'bookings', 'anon', array[]::text[], 'anon: no booking privileges');
select table_privs_are('public', 'bookings', 'authenticated', array['SELECT'], 'authenticated: bookings read-only; all writes via RPC');
select table_privs_are('public', 'booking_events', 'anon', array[]::text[], 'anon: no booking event privileges');
select table_privs_are('public', 'booking_events', 'authenticated', array[]::text[], 'authenticated: booking events via column grants only (no actor ids); written via RPC');

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
       ('private', 'can_view_booking(p_booking_id uuid)', 'authenticated'),
       ('private', 'has_role(p_role app_role)', 'anon'),
       ('private', 'has_role(p_role app_role)', 'authenticated'),
       ('private', 'is_destination_published(p_destination_id uuid)', 'anon'),
       ('private', 'is_destination_published(p_destination_id uuid)', 'authenticated'),
       ('private', 'is_experience_member(p_experience_id uuid)', 'authenticated'),
       ('private', 'is_experience_public(p_experience_id uuid)', 'anon'),
       ('private', 'is_experience_public(p_experience_id uuid)', 'authenticated'),
       ('private', 'is_provider_member(p_provider_id uuid)', 'anon'),
       ('private', 'is_provider_member(p_provider_id uuid)', 'authenticated'),
       ('private', 'is_provider_verified(p_provider_id uuid)', 'anon'),
       ('private', 'is_provider_verified(p_provider_id uuid)', 'authenticated'),
       ('private', 'owns_itinerary(p_itinerary_id uuid)', 'authenticated'),
       ('private', 'provider_accepts_detail_changes(p_provider_id uuid)', 'authenticated'),
       ('private', 'today_ist()', 'anon'),
       ('private', 'today_ist()', 'authenticated'),
       ('public', 'ai_generations_today()', 'authenticated'),
       ('public', 'begin_itinerary_generation(p_itinerary_id uuid, p_global_daily_limit integer)', 'authenticated'),
       ('public', 'cancel_booking(p_booking_id uuid, p_reason text)', 'authenticated'),
       ('public', 'create_provider_application(p_slug text, p_display_name text, p_description text, p_district text, p_legal_name text, p_contact_email text, p_contact_phone text)', 'authenticated'),
       ('public', 'finish_itinerary_generation(p_generation_id bigint, p_outcome itinerary_generation_outcome, p_error_code text, p_model text, p_prompt_version text, p_latency_ms integer, p_input_tokens integer, p_output_tokens integer)', 'authenticated'),
       ('public', 'request_booking_on_date(p_experience_id uuid, p_date date, p_adults integer, p_children integer, p_contact_phone text, p_note text, p_idempotency_key uuid)', 'authenticated'),
       ('public', 'request_booking(p_slot_id uuid, p_adults integer, p_children integer, p_contact_phone text, p_note text, p_idempotency_key uuid)', 'authenticated'),
       ('public', 'request_itinerary_bookings(p_version_id uuid, p_contact_phone text, p_note text, p_idempotency_key uuid)', 'authenticated'),
       ('public', 'respond_to_booking(p_booking_id uuid, p_decision booking_status, p_final_total_minor bigint, p_note text)', 'authenticated'),
       ('public', 'review_provider(p_provider_id uuid, p_decision provider_status, p_note text)', 'authenticated'),
       ('public', 'save_itinerary_version(p_generation_id bigint, p_itinerary_id uuid, p_title text, p_kind itinerary_version_kind, p_preferences jsonb, p_plan jsonb, p_schema_version text, p_prompt_version text, p_model text, p_travelers integer, p_warnings jsonb, p_items jsonb)', 'authenticated'),
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
       ('availability_slots', 'anon', 'SELECT', 'capacity,created_at,experience_id,id,seats_confirmed,start_time,starts_on,status,updated_at'),
       ('availability_slots', 'authenticated', 'INSERT', 'capacity,experience_id,start_time,starts_on'),
       ('availability_slots', 'authenticated', 'SELECT', 'capacity,created_at,experience_id,id,seats_confirmed,start_time,starts_on,status,updated_at'),
       ('availability_slots', 'authenticated', 'UPDATE', 'capacity,status'),
       ('booking_events', 'authenticated', 'SELECT', 'actor_role,booking_id,created_at,from_status,id,note,to_status'),
       ('bookings', 'authenticated', 'SELECT', 'adults,cancellation_reason,cancelled_by,children,confirmed_total_minor,contact_phone,created_at,currency,estimated_total_minor,experience_id,experience_title,id,idempotency_key,party_size,provider_id,provider_note,reference,request_expires_at,slot_id,slot_start_time,slot_starts_on,status,traveler_id,traveler_name,traveler_note,updated_at'),
       ('destinations', 'anon', 'SELECT', 'created_at,description,district,id,is_published,name,search_vector,slug,summary,updated_at'),
       ('destinations', 'authenticated', 'INSERT', 'description,district,is_published,name,slug,summary'),
       ('destinations', 'authenticated', 'SELECT', 'created_at,description,district,id,is_published,name,search_vector,slug,summary,updated_at'),
       ('destinations', 'authenticated', 'UPDATE', 'description,district,is_published,name,slug,summary'),
       ('experiences', 'anon', 'SELECT', 'accepts_bookings,category,created_at,currency,description,destination_id,duration_minutes,id,moderation_locked,price_from_minor,provider_id,published_at,search_vector,slug,status,summary,title,updated_at'),
       ('experiences', 'authenticated', 'INSERT', 'accepts_bookings,category,description,destination_id,duration_minutes,price_from_minor,provider_id,slug,status,summary,title'),
       ('experiences', 'authenticated', 'SELECT', 'accepts_bookings,category,created_at,currency,description,destination_id,duration_minutes,id,moderation_locked,price_from_minor,provider_id,published_at,search_vector,slug,status,summary,title,updated_at'),
       ('experiences', 'authenticated', 'UPDATE', 'accepts_bookings,category,description,destination_id,duration_minutes,price_from_minor,slug,status,summary,title'),
       ('itineraries', 'authenticated', 'SELECT', 'created_at,current_version_id,id,owner_id,title,updated_at'),
       ('itineraries', 'authenticated', 'UPDATE', 'current_version_id,title'),
       ('itinerary_generations', 'authenticated', 'SELECT', 'created_at,error_code,id,input_tokens,itinerary_id,latency_ms,model,outcome,output_tokens,prompt_version,user_id'),
       ('itinerary_items', 'authenticated', 'SELECT', 'day_number,destination_id,destination_name_snapshot,duration_snapshot_minutes,experience_id,experience_title_snapshot,id,position,price_snapshot_minor,rationale,time_of_day,version_id'),
       ('itinerary_versions', 'authenticated', 'SELECT', 'created_at,currency,estimated_total_minor,id,itinerary_id,kind,model,plan,preferences,prompt_version,schema_version,travelers,unpriced_item_count,version_number,warnings'),
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
