# ADR-0009: Self-serve account deletion and in-app booking alerts

- Status: Accepted
- Date: 2026-10-15
- Deciders: Product owner (self-serve deletion; launch-readiness scope), Engineering
- Implementation: Phase 4 (launch readiness), migrations `20261015123702_account_deletion` and
  `20261015125458_booking_alerts`; pgTAP `supabase/tests/account_deletion.test.sql`,
  `supabase/tests/booking_alerts.test.sql`.

## Context

Launch needs a way for people to leave (DPDP Act 2023: erasure on request) and a way for partners and
travellers to notice booking changes. Email notifications need a sending domain, which the owner
doesn't have yet. Until now, deleting a user cascaded to their bookings, erasing partners' records.

## Decision

### Account deletion

- **Self-serve, from account settings**, for traveller and partner accounts. Admin accounts are
  removed only by the owner (ADR-0002 runbook).
- **Re-verification, enforced by the database:** `delete_my_account()` requires the session's signed
  `amr` to contain a sign-in by password, Google, authenticator code, one-time code or recovery within the
  last 15 minutes. Re-checking a password on another client wouldn't change the session, so the app
  refreshes the session itself. Typing "DELETE" is also required. The refresh depends on the account:
  - **Authenticator enrolled:** a fresh code, which keeps the session at the second step.
  - **Password account:** a password sign-in on the current session, with per-account attempt limits.
  - **Google-only account:** a Google sign-in within the last 15 minutes.

  A stolen access token can't delete an account without that fresh sign-in.

- **`public.delete_my_account()`** (security definer, one transaction):
  - locks the user row, so a booking can't be created mid-deletion, and the caller's businesses, so
    two co-members can't both leave;
  - refuses admins, and sessions without the second step when an authenticator is enrolled;
  - refuses the **last member of a business** with open requests or upcoming confirmed bookings. When
    the last member leaves, the business's listings stop accepting bookings;
  - cancels the traveller's open and upcoming bookings through `cancel_booking`, so seats are released
    and partners see the reason. A confirmed booking within 24 hours, or one under way, blocks
    deletion;
  - deletes the `auth.users` row. That cascades to the profile, memberships, itineraries and attempt
    counters, and sets `bookings.traveler_id` to null (`on delete set null`).
- **Anonymisation is a trigger** (`bookings_anonymise_on_traveller_removed`), so every deletion path
  is covered, including the dashboard and the admin API.
  - It removes the traveller's name, phone, note and pickup details.
  - It replaces their own cancellation reasons and history notes with "The traveller deleted their
    account."
  - Deleting a user outside the app still doesn't cancel their open bookings, so the owner runbook
    should use the app or cancel them first.
- The app never uses the Supabase secret key for this.

### In-app booking alerts (until email)

- **Travellers:** `profiles.bookings_seen_at`; `my_booking_updates()` lists bookings with partner or
  system events since then. The account menu shows a count; "My bookings" labels them "Updated" and
  then calls `mark_bookings_seen()`.
- **Partners:** `partner_booking_alerts()` counts open requests and those expiring within 12 hours
  (after two-step login, via `is_provider_member`), and, since instant booking (ADR-0004 amendment
  2026-10-29), bookings confirmed in the last 48 hours (`new_bookings`). Bars on every partner-portal
  page and a menu count show them.

## Alternatives considered

- **Deletion by email request:** less code, but slow and manual. The owner chose self-serve.
- **Hard-delete bookings with the user:** partners would lose records of confirmed trips.
- **A notifications table with one row per event:** more flexible, but the "seen since" timestamp
  answers the MVP question with no extra writes. Revisit with email notifications.

## Consequences

- Partners keep past bookings without traveller personal data; the booking page says the traveller
  deleted their account.
- A business whose last member leaves keeps its profile and private details (business records) but
  stops accepting bookings; an admin can suspend or archive it.
- Supabase's own auth audit logs may keep the email and IP address for a while after deletion; the
  app logs only the user ID (`account.deleted`).
- Email notifications (RELEASE_CHECKLIST §4) are still needed for travellers and partners who don't
  open the site; these alerts reduce, but don't remove, silent expiries.
