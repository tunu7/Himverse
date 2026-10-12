-- Follow-ups from the second security review of Phase 1.
--
-- L-2  The moderation trigger ran as the invoker, so any role without USAGE on
--      `private` (e.g. service_role in a future background job) could not
--      update experiences at all. Run it as its owner instead; auth.uid() still
--      reads the caller's JWT claims, so the moderator check is unchanged.
-- L-4  A suspended provider could edit its public profile (e.g. to impersonate
--      another brand) and reinstatement would make the edit live unreviewed.
--      Freeze the profile while suspended as well as while pending review.

alter function private.enforce_experience_moderation() security definer;

drop policy "members update own provider profile outside review" on public.providers;
create policy "members edit own profile unless pending or suspended"
  on public.providers for update to authenticated
  using (private.is_provider_member(id) and status not in ('pending_review', 'suspended'))
  with check (private.is_provider_member(id) and status not in ('pending_review', 'suspended'));
