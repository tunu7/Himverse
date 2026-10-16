# ADR-0004: Booking lifecycle — slots, provider confirmation and idempotency

- Status: Accepted (amended 2026-10-15: everything bookable, see the end)
- Date: 2026-10-12
- Deciders: Product owner (availability model, price, expiry/cancellation defaults, contact sharing),
  Engineering
- Implementation: Phase 4, migration `20261012180243_bookings`, `src/server/bookings/`,
  `src/features/bookings/`

## Context

Travellers must be able to request experiences from verified providers, and providers must confirm.
Nothing may be shown as confirmed unless it really is. Retries and double submits must not create
duplicates, and concurrent confirmations must not overbook. There is no payment provider, so no money
moves (see [BOOKING_POLICY](../product/BOOKING_POLICY.md) for business rules and open questions).

## Decision

### 1. Availability: dated slots; the provider confirms

- Providers publish `availability_slots`, each a date with an optional start time and a seat capacity.
- **Requests don't hold seats.** Seats are counted only when the provider confirms, which avoids
  capacity being squatted by unanswered requests.
- **Confirmation is the authoritative availability check.** It locks the slot row (`FOR UPDATE`) and
  re-checks:
  - the slot is open and in the future;
  - the experience is still public;
  - enough seats remain.
- `seats_confirmed <= capacity` is a **check constraint**, so overbooking is impossible even if the
  application logic were wrong.

### 2. Lifecycle and authorization

```
requested ──confirm──▶ confirmed ──date passes──▶ completed
    │ ├─decline (reason)──▶ declined      ├─traveller cancels (≥ 24 h before)──▶ cancelled
    │ └─traveller cancels──▶ cancelled     └─provider cancels (reason)──────────▶ cancelled
    └─no reply in 48 h, or slot start──▶ expired
```

- **Every transition goes through a `security definer` function:** `request_booking`,
  `respond_to_booking`, `cancel_booking`, and the scheduled `private.sweep_bookings`.
- **No API role can update status, price, provider or ownership columns.**
- Each function checks `auth.uid()` and the caller's relationship: the traveller who made the booking,
  or a member of the booking's (verified) provider. Anyone else gets the same "not found", so there's
  no existence oracle.
- **Provider, experience, price and expiry are derived from the slot by the database.** The client sends
  only slot, party, phone, note and idempotency key.
- **Every change appends a `booking_events` row:** from, to, actor role, actor and note.
- **Deadlines are enforced twice:** functions refuse late actions themselves, and a `pg_cron` job every
  15 minutes materialises `expired` and `completed`. The UI shows overdue requests as expired
  immediately.

### 3. Duplicates and retries

- **Idempotency key:** the server generates a UUID for each rendered booking form, and the form resends
  it on retry or double submit.
  - `unique (traveler_id, idempotency_key)` plus `insert … on conflict do nothing` means a replay
    returns the original booking, even in a race.
  - The same key with different details is rejected.
- **One active booking per traveller per slot:** a partial unique index on `requested` and `confirmed`.
- **Verified with genuinely parallel database connections**
  (`tests/integration/booking-concurrency.test.ts`):
  - 10 simultaneous submissions with one key create exactly 1 booking;
  - parallel different-key submissions create 1;
  - parallel confirmations never exceed capacity.

### 4. Price

- **At request:** an estimate snapshot (database per-person price × party size), or null if unpriced.
- **At confirmation:** the provider must state the final total. Both are kept and shown, and later
  catalogue price changes never rewrite either. No payment is taken.

### 5. Data visible to each party

- **Travellers:** their own bookings.
- **Provider members:** their provider's bookings, including the traveller's display name (snapshotted,
  because providers can't read profiles) and the **contact phone given for that booking**. The account
  email is never shared.
- **Admins:** read-only, for support.
- **Snapshots:** experience title and slot date/time are snapshotted on the booking, so history stays
  readable after slots close or experiences are hidden.
- **Note:** providers can see the traveller's opaque user id on their own bookings. The traveller list
  filters on it, and column privileges can't vary by policy. It's never public.

## Alternatives considered

- **Requests hold seats:** fewer surprises, but unanswered requests block capacity. Rejected (your
  decision).
- **Pure requests with no slots:** nothing to re-check and no visible availability. Rejected.
- **Application-level checks with direct table writes:** the JS client has no transactions, and a check
  followed by a separate write races. Rejected in favour of database functions with row locks and
  constraints.
- **Client-generated idempotency keys only in JavaScript:** a server-rendered key works without JS and
  survives full-page retries. Chosen.

## Consequences

**Positive**

- Overbooking and duplicate bookings are prevented by database constraints, not only by code.
- Status is authoritative and audited.
- Providers can't see each other's bookings.

**Negative**

- No notifications: travellers and providers must check the app.
- `pg_cron` must be enabled on hosted projects.
- Children are estimated at the adult per-person price until pricing rules exist.

**Follow-up**

- Payments (a separate ADR), notifications, rescheduling, and no-show and dispute handling.

## Amendment (2026-10-15): everything bookable

Migration `20261014205730_bookable_experiences_and_trip_booking`. Decided by the product owner: partners
choose what is bookable, the AI plans only with bookable experiences, and travellers can book a whole
itinerary.

- **Partners choose what's bookable.** Each experience has an `accepts_bookings` switch, on by default.
  Members of the experience's own provider (or an admin) can change it. Only public experiences with
  `accepts_bookings` can be requested (`private.is_experience_bookable`), and AI retrieval only
  considers them.
- **Any future date.** `request_booking_on_date` accepts a bookable experience and any date from
  tomorrow (India time).
  - If an open published slot exists on that date, it is used, and the seat limits above still apply.
  - Otherwise the booking has no slot (`slot_id` is null). The provider's confirmation is then the
    availability check, and no seat counts are kept.
  - Each traveller can have only one active request per experience and date.
  - The 48-hour response window, the 24-hour cancellation rule and completion use the booking's date.
  - This supersedes the "Pure requests with no slots: rejected" alternative above. Slots remain
    optional, for partners who want capacity limits.
- **Book a whole trip.** `request_itinerary_bookings` lets the itinerary's owner request every item of
  a version in one call.
  - Dates and party size come from the stored version, never from the client.
  - Each item is requested independently: unbookable items report a reason and don't block the rest.
  - Item keys are derived from one client key (`md5(key:item_id)`), so a retry replays rather than
    duplicating.
- **Request limits** are 30 per hour, 60 per day and 40 awaiting a response, so a whole trip fits.
- **Closed dates stay closed.** A date that has a published slot but no open one (the provider closed
  it) can't be requested or confirmed as a plain date.
- **Seat limits survive late publishing.** When the provider confirms a date request, an open slot that
  has since been published on that date absorbs the party, under the slot lock. `seats_confirmed <=
capacity` therefore still holds for every published date.
- **Retries:** a date request is identified by experience and date, so a retry still replays after a
  slot appears or disappears.
- **Request limits:** each traveller's requests are serialised with an advisory lock, so concurrent
  calls can't exceed the limits.
- **Horizon:** dates can be at most two years ahead, the same as provider slots.
- **Whole trip:** only expected refusals are reported per item. Unexpected errors abort the call, and
  the app logs them.
- **Timing:** a date request without a start time starts at midnight India time. The 48-hour response
  window and the 24-hour cancellation rule are measured from then. Example: a request at 23:50 for
  tomorrow leaves the provider about 10 minutes to reply.
- **Pending requests after switching off:** a provider who stops accepting requests can still confirm
  or decline the ones already pending.
- **Plans built earlier:** "AI plans only with bookable experiences" is applied at planning time. If a
  provider switches requests off later, an item in an existing plan fails with a clear reason when the
  trip is booked. Any version of an itinerary the traveller owns can be booked.
- `request_booking` (by slot) is kept for compatibility. The app now uses date requests.

## Amendment (2026-10-15): traveller approval for large price increases

Owner decision; answers BOOKING_POLICY question 9 (security review L1). Migration
`20261016140720_booking_price_approval`.

- **Threshold:** `private.price_needs_approval(estimate, final)` is true when the final total is more than
  10% above the estimate (integer comparison `final × 10 > estimate × 11`), or when there was no estimate.
- **Proposal, not a new status:** above the threshold, `respond_to_booking(..., 'confirmed', total)` keeps
  the booking `requested`, stores `proposed_total_minor` and `price_proposed_at`, resets
  `request_expires_at` to 48 hours (or the start, if sooner) and returns `requested`. No capacity is taken.
  Keeping the status means the request limits, one-active-booking indexes and sweep apply unchanged.
- **While a proposal is open** the partner can only decline. Partner alerts don't count it as waiting.
- **Acceptance:** `accept_booking_price(booking, total)` (traveller only; `total` must equal the
  proposal) re-checks the provider, listing, date and capacity through `private.confirm_booking`, which
  both paths now share, and confirms at the proposed total. A retry after success returns `confirmed`.
- **Declining** is the existing traveller cancellation of a request. **No answer** expires through the
  sweep, with its own event note.
- Bookings also store `listing_type` (migration `20261016140505_booking_listing_type`), copied by trigger
  at insert and immutable, so labels survive a hidden listing.
