# ADR-0004: Booking lifecycle — slots, provider confirmation and idempotency

- Status: Accepted
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
