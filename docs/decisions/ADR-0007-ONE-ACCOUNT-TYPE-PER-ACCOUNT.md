# ADR-0007: One account type per account (traveller, partner or admin)

- Status: Accepted
- Date: 2026-10-15
- Deciders: Product owner
- Supersedes: [ADR-0002](ADR-0002-AUTHORIZATION-MODEL.md) in part: the "one person can be both a traveller and
  a provider" premise, and "every authenticated user is a traveller". The rest of ADR-0002 stands.
- Implementation: migration `20261014215750_account_types`, app changes and pgTAP tests (commit 381d6ba, 2026-10-15).

## Context

ADR-0002 made "traveller" implicit for every signed-in user and let anyone, admins included, apply as a
provider. That meant:

- An admin could book experiences and run a tourism business on the platform they moderate. Only a
  narrow check stopped an admin from verifying their own provider.
- Partners could request bookings and generate itineraries from the same account they use to answer
  booking requests.
- The UI could only infer what an account was from `user_roles` and `provider_members`. Landing, menus
  and portals had to guess.

The owner called the mix "messed up". They asked for separated role interfaces, following current
marketplace practice: one account per role, enforced in the database and not only in the UI
([MVP_SCOPE](../product/MVP_SCOPE.md#roles)).

## Decision

1. **`profiles.account_type`** (`traveller | partner | admin`) is the single source of what an account
   is. It is nullable only for an account that hasn't chosen a type yet (Google sign-up). No API role
   can write it: it isn't in any update grant.
2. **Setting it:**
   - **Sign-up** sets traveller or partner from the sign-up metadata `account_type`, in
     `handle_new_user`. Metadata can never produce `admin`.
   - **Google sign-up:** `public.choose_account_type(traveller|partner)`, callable **once**, only while
     the type is null. It refuses `admin`, and refuses to change a type that is already set.
   - **Admin** is set only by the `user_roles_sync_account_type` trigger when the owner grants the admin
     role through the existing SQL runbook. There is still no admin-grant endpoint.
   - **Untyped fallback:** an untyped account takes the type of its first typed action (applying →
     partner; booking or planning → traveller). This goes through `private.claim_account_type`. The app
     still sends untyped accounts to choose a type first.
3. **Enforcement is in the database:**
   - Row triggers allow only partner accounts to insert into `provider_members`, and only traveller
     accounts to insert into `bookings` and `itinerary_generations`. Triggers cover every RPC path,
     including whole-trip booking and owner-run SQL.
   - `private.is_provider_member` also requires `account_type = 'partner'`. So an admin, or anyone
     else who is still a member, holds no provider authority.
4. **Existing accounts are backfilled:**
   - accounts with the admin role → admin;
   - provider members → partner;
   - everyone else → traveller.

   Their past rows stay readable.

5. **Changing type is not self-service.** One person who needs two roles uses two accounts, with two
   email addresses. Converting an existing account is an owner-run SQL operation.

## Alternatives considered

- **Keep ADR-0002's multi-role model and separate only the UI.** Rejected: the owner required database
  enforcement. A UI-only split leaves direct PostgREST calls able to cross roles.
- **Role-switching within one account (a "switch to partner mode" toggle).** Common on consumer
  marketplaces. Rejected because it brings back the conflicts above: admins booking, and partners
  booking their own listings.
- **Store the type in JWT claims or `user_metadata`.** `user_metadata` is user-writable. Claims would
  apply only after a token refresh, and they aren't authoritative (see ADR-0002's alternatives).
  Rejected.
- **Make `user_roles` hold traveller and partner too.** This would allow several rows per user, which is
  the opposite of the goal. A single typed column with no write grant is simpler to reason about.
  Rejected.

## Consequences

**Positive**

- Each audience gets one interface: traveller site, partner portal or admin console. Landing and
  navigation follow `account_type` directly.
- Admins can't book or run a business. Partners can't book or plan trips. This holds even for direct
  API calls.
- Self-escalation is still impossible: no API path writes `account_type`, and `admin` is never claimable.

**Negative**

- Someone who is both a traveller and a guide needs two accounts.
- A small extra lookup on `profiles` in `is_provider_member` and in the insert triggers.
- After a Google sign-up there is an extra step to choose a type.

**Follow-up**

- App:
  - a type picker after Google sign-up;
  - sign-up sends `account_type`;
  - session and landing read it (`src/server/auth/session.ts`, `landing.ts`);
  - hide booking and planning actions for non-travellers.
- Update [SECURITY](../security/SECURITY.md) and the admin bootstrap runbook. The
  runbook must use an account created for admin only.

## Implementation notes (2026-10-15)

- **Security review follow-ups** (migration `20261014215750_account_types`):
  - Conflict-of-interest checks use `private.belongs_to_provider`, which looks at raw membership. An
    admin who kept an old membership therefore still can't verify that provider or clear its
    moderation lock.
  - Granting admin to an account that still belongs to a provider is refused. The owner removes the
    membership first.
  - Revoking admin sets the account back to untyped, so it chooses again on `/welcome`.
  - `submit_provider_application` requires a partner account.
  - The backfill leaves accounts with no activity untyped, so they choose a type themselves.
- **Two-step login** (migration `20261014221826_two_step_login`, Phase 2):
  - `private.has_role` and `private.is_provider_member` require the JWT `aal` to be `aal2`, so a
    password alone grants no admin or provider power.
  - Inserts and updates to `providers` by signed-in users also require `aal2`.
  - The app sends partners and admins through `/mfa/setup` or `/mfa/verify`.
  - Travellers are unaffected.
- **Password reset and change:**
  - Reset uses a PKCE link (same browser only), and requires a recovery sign-in from the last 15
    minutes plus the second step if one is enrolled.
  - Change checks the current password on a separate, cookie-less client.
  - Both sign out other sessions.
