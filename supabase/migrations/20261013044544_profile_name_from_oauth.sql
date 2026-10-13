-- Google sign-in (Phase 5): Google puts the person's name in full_name / name,
-- not display_name. Prefill the profile from those too. As before, metadata only
-- prefills display_name and never influences authorization.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(left(new.raw_user_meta_data ->> 'display_name', 80)), ''),
      nullif(btrim(left(new.raw_user_meta_data ->> 'full_name', 80)), ''),
      nullif(btrim(left(new.raw_user_meta_data ->> 'name', 80)), ''),
      nullif(btrim(left(split_part(coalesce(new.email, ''), '@', 1), 80)), ''),
      'Traveler'
    )
  );
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
