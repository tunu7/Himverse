# ADR-0002: Authorization model — database-enforced roles and provider membership

- Status: Accepted; partly superseded by [ADR-0007](ADR-0007-ONE-ACCOUNT-TYPE-PER-ACCOUNT.md) (one account type per account)
- Date: 2026-10-12
- Deciders: Product owner, Engineering (Phase 1 planning)
- Implementation: Phase 1, migrations `20261012131029_identity_and_roles`, `20261012131030_providers`,
  `20261012131031_catalog`, with pgTAP tests in `supabase/tests/`. Those files are authoritative; see
  "Implementation notes" at the end for details settled during implementation.

## Context

Phase 1 introduces accounts, provider applications and verification, and the first tourism catalogue
(destinations and experiences). We need to decide where authority lives and how it's enforced:

- Three kinds of actor: travelers, provider staff, and Himverse admins. One person can be both a traveler
  and a provider.
- Supabase exposes tables directly to browsers through the publishable key. **Row Level Security (RLS) is
  the actual security boundary.** Server code checks give better errors but aren't the guarantee.
- Users can edit their own profile and `user_metadata`. Neither can be trusted for authorization.
- Suspending a provider or revoking an admin must take effect promptly.
- [ADR-0001](ADR-0001-MODULAR-MONOLITH.md): one Next.js app and one Supabase project, with no extra
  services. The RLS-bypassing secret key should stay unused unless a documented path needs it.

## Decision

### 1. Authority lives in tables that RLS checks on every statement

- **Traveler is implicit.** Every authenticated user is a traveler. No row needed.
- **Admin is a row in `public.user_roles`** (`user_id`, `role app_role`, `granted_by`, `granted_at`;
  unique per user and role). The enum starts with only `admin`.
- **Provider authority comes from membership,** not from a global role. `public.provider_members` links a
  user to a provider with `member_role` (`owner` in Phase 1). What a member may do depends on the
  provider's `status`.
- Policies call helpers in a non-exposed `private` schema: `private.has_role(role)`,
  `private.is_provider_member(provider_id)`, `private.is_provider_verified(provider_id)`,
  `private.is_destination_published(destination_id)`. They are `security definer`, `stable`,
  `set search_path = ''`, use fully qualified names, and return only booleans (about the calling user, or
  about whether a row is publicly visible).

Changes take effect on the caller's **next query**. No JWT refresh is needed.

### 2. Nobody can grant roles from the application

- `anon` and `authenticated` have **no** `insert`, `update` or `delete` privilege on `user_roles`
  (revoked explicitly, plus no write policies). Users can `select` their own rows; admins can select all.
- No RPC, Server Action, route handler or UI grants or revokes roles in Phase 1. **There is no admin-grant
  endpoint.**
- The application never uses the Supabase secret key for this. Roles are granted only by the database
  owner running SQL directly. See the bootstrap runbook in
  [SECURITY](../security/SECURITY.md).
- Signup metadata is used only to prefill `profiles.display_name`. It never sets a role, membership or
  status.

### 3. Provider lifecycle changes only through audited database functions

```
draft ──submit──▶ pending_review ──review──▶ verified ◀──reinstate── suspended
                        ▲                       │                       ▲
                        │                       └────────suspend────────┘
                        └──resubmit── rejected ◀──review──(pending_review)
```

| Function (RPC, `public`, `security definer`) | Caller | Effect |
| --- | --- | --- |
| `create_provider_application(...)` | Any authenticated user | Creates a `draft` provider, the caller's `owner` membership and the private details, all in one transaction |
| `submit_provider_application(provider_id)` | Owner of that provider | `draft` or `rejected` → `pending_review` |
| `review_provider(provider_id, decision, note)` | Admin | `pending_review` → `verified` or `rejected`; `verified` → `suspended`; `suspended` → `verified` |

- Each function checks `auth.uid()` and the allowed transition, and fails closed.
- Each status change writes a `provider_status_events` row (from, to, actor, note, time).
- `status` and `verified_at` are **excluded from column-level `update` grants** for everyone, admins
  included, so the functions are the only way to change them. Members may update descriptive columns
  only (column grants).

### 4. Public data is chosen deliberately, and private details live in their own table

RLS filters rows, not columns, so data that should never be public is kept in separate tables.

| Data | anon / other users | Provider members | Admin |
| --- | --- | --- | --- |
| `profiles` | ✗ | own profile only | read |
| `user_roles` | ✗ | own rows (read) | read |
| `providers` (public profile columns) | only `status = 'verified'` | own, any status | read |
| `provider_private_details` (legal name, contact email/phone) | ✗ | own | read |
| `provider_members`, `provider_status_events` | ✗ | own provider | read |
| `destinations` | only `is_published` | same as public | all |
| `experiences` | only if **all three** visibility conditions hold (below) | own provider's, any status | all |

An experience is publicly visible only when:

1. `experiences.status = 'published'`,
2. its provider has `status = 'verified'`, and
3. its destination has `is_published = true`.

These conditions are checked live in the `select` policy, so they can't go stale. Suspending a provider,
or unpublishing a destination, hides the affected experiences from the public immediately.

### 5. Publication rules for experiences

- Members of a provider can create and edit that provider's experiences while it is in **any** status
  (so drafts can be prepared before verification).
- The `insert` and `update` `with check` rules allow `status = 'published'` **only while the provider is
  `verified`**. Draft, pending, rejected and suspended providers can't publish.
- Members can't change `provider_id` (left out of the column grant), so an experience can't be moved to
  another provider.
- Publishing still needs a published destination to be visible (point 4). A published experience attached
  to an unpublished destination stays hidden.
- Admins can update any experience, for example to unpublish or archive it. The publication condition
  applies to admins too: nobody can set `published` for an unverified provider or an unpublished destination.
- **Suspended providers:** their experiences disappear from public reads straight away, and members can't
  set any experience to `published`. Existing `published` rows keep that status but stay hidden until an
  admin reinstates the provider. That restores visibility without the provider having to republish
  everything. While suspended, members also can't edit a `published` experience without first
  unpublishing it, so suspended content can't change while hidden.

**Accepted MVP behaviour (edits to live experiences):** a verified provider's edits to a published
experience (title, description, price-from, duration) go public **immediately, without re-review**.
We accept this for the MVP because providers are verified before they can publish, admins can unpublish
or suspend at any time, and pre-moderation would add a second review workflow. To revisit (new ADR) if
content quality or abuse problems appear, for example re-review of material changes or a content-change
log.

### 6. Server code mirrors these rules for errors, and RLS enforces them

- `src/server/auth/session.ts` (server-only):
  - `getCurrentUser()` reads the user from `supabase.auth.getClaims()`, which verifies the JWT. It never
    uses unverified session data.
  - `requireUser()` and `requireAdmin()` are called at the start of every protected Server Action and page.
- Transition rules are mirrored in a pure TypeScript module, so the UI can show the right actions and
  return clean `AppError`s. The database stays authoritative, and both sides are tested.
- `src/proxy.ts` refreshes the session cookie and redirects signed-out visitors away from protected
  routes. It is **never** the authorization check. Next.js 16 documents that matchers can skip Server
  Functions.

## Alternatives considered

- **`role` column on `profiles`.** Simplest, but `profiles` is user-writable. A single missing column grant
  would let a user make themselves admin, and it allows only one role per user. Rejected.
- **JWT custom claims via an access-token hook.** Avoids a table lookup in policies, but role changes and
  suspensions wouldn't apply until the token refreshes (`jwt_expiry` = 1 h). It also adds hook config, and
  claims have to be kept in sync with the tables. Rejected for now. It could be added later as a
  performance cache with the tables still authoritative.
- **Global `provider` role.** Doesn't model staff who belong to a specific provider, or someone who belongs
  to several. Rejected in favour of membership.
- **Status and admin actions through a secret-key server client.** Moves enforcement out of the database
  and leaves a privileged key in the request path. Rejected.
- **Admin pre-moderation of every experience.** Covered in point 5. Deferred.

## Consequences

**Positive**

- Self-escalation is impossible through any API surface. The only path is direct database-owner SQL.
- Revocations and suspensions apply on the next request.
- One enforcement point (RLS) protects both the app and direct PostgREST access with the publishable key.
- No secret key is needed in Phase 1.

**Negative**

- Policy helpers add a small lookup per statement. They are indexed and `stable`; measure before
  optimising.
- Lifecycle logic exists in SQL and in TypeScript and could drift. Mitigated by pgTAP tests on the SQL
  rules and unit tests on the TypeScript mirror.
- Granting the first admin, and any later ones, is a manual, privileged operational step.
- Verified providers can change live content without review (accepted, see point 5).

**Follow-up**

- An admin-management UI, if ever added, must be an admin-only `security definer` function with an audit
  log and its own ADR.
- Staff invitations (non-owner members) come later.
- Production auth settings (email confirmation on, password policy) must be configured in the Supabase
  dashboard. `supabase/config.toml` covers only the local stack.

## Implementation notes (Phase 1)

Settled during implementation and covered by the pgTAP tests:

- **Live provider profile edits.** The accepted behaviour in point 5 also applies to a verified
  provider's public profile (`display_name`, `description`, `district`): edits go live without
  re-review. `slug` can't be changed after creation.
- **No deletion.** Experiences are archived, not deleted; there's no delete grant. Providers are never
  deleted through the API.
- **Notes required.** `review_provider` requires a note when rejecting or suspending. The note is shown
  to the provider.
- **Suspended providers can't resubmit.** `submit_provider_application` accepts only `draft` or
  `rejected`, so a suspended provider can't put itself back into review. Only an admin can reinstate it.
- **Error codes.** The functions raise distinct SQLSTATEs (`42501`, `P0002`, `55000`, `22023`), which
  `src/lib/supabase/errors.ts` maps to `AppError` codes.
- **`/explore` uses an anonymous, cookie-less client** (`src/lib/supabase/public.ts`), so RLS alone
  decides what's public. A signed-in provider's own drafts never appear there.

### Security review hardening (migration `20261012133752_security_hardening`)

An independent review of Phase 1 found no critical or high issues. These changes close the confirmed
findings:

- **Admin moderation sticks.** When an admin (who isn't a member of the provider) unpublishes or
  archives an experience, a trigger sets `moderation_locked`. Members can't publish a locked experience
  or write the flag; only an admin publishing it clears the lock. This narrows the "edits to live
  experiences" acceptance in point 5: providers can edit live content, but can't undo moderation.
- **Reviewed identity is frozen.** `provider_private_details` can be edited only while the provider is
  `draft` or `rejected`. The public profile can't change while `pending_review`. After verification,
  legal or contact changes go through Himverse support. This replaces the earlier "members may update
  private details" rule.
- **No whitespace padding.** Length-checked text columns also require no leading or trailing spaces.
- **No user ids exposed.** `created_by` (providers, experiences) and `provider_status_events.actor_id`
  aren't selectable by API roles (column-level grants).
- **No default sequence or trigger-function privileges** for API roles.
  `supabase/tests/privileges.test.sql` checks the whole catalog so future objects can't silently inherit
  Supabase's default grants.
- **Admin bootstrap selects by verified user id,** not email, and requires email confirmations to be on
  ([runbook](../security/SECURITY.md)).

### Second review follow-ups (migration `20261012135457_review_followups`)

- **The moderation lock is per experience.** A verified provider can still publish a _new_ experience
  with similar content. The lock stops a provider undoing a specific admin decision; it isn't a
  provider-wide sanction. **Suspension is the escalation** for repeated abuse.
- **Clearing a lock is SQL-only for now.** There's no admin experience-moderation UI in Phase 1; an admin
  publishing the row through the API clears the lock.
- **Profile frozen while suspended.** The public profile can't change while `pending_review` _or_
  `suspended`, so reinstatement reviews what was suspended.
- **The moderation trigger runs as its owner** (`security definer`), so future system roles without
  access to `private` (e.g. `service_role`) can still update experiences.
- **Login CSRF on `/auth/confirm` is reduced, not removed.** Only `signup` and `email_change` tokens are
  accepted, but an attacker could still send a victim the signup link of a fresh attacker-owned account.
  Email link scanners can also consume one-time tokens. Follow-up: a confirmation interstitial that
  completes verification with a POST.
