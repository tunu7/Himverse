-- Accounts created before the identity migration ran (e.g. a sign-up on a new
-- hosted project before `db push`) have no profile, because the
-- on_auth_user_created trigger didn't exist yet. Create the missing profiles with
-- the same naming rules as private.handle_new_user(). Idempotent; grants no roles.

insert into public.profiles (id, display_name)
select
  u.id,
  coalesce(
    nullif(btrim(left(u.raw_user_meta_data ->> 'display_name', 80)), ''),
    nullif(btrim(left(u.raw_user_meta_data ->> 'full_name', 80)), ''),
    nullif(btrim(left(u.raw_user_meta_data ->> 'name', 80)), ''),
    nullif(btrim(left(split_part(coalesce(u.email, ''), '@', 1), 80)), ''),
    'Traveler'
  )
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
