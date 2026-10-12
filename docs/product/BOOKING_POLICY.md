# Booking Policy (provisional)

Business rules behind the booking lifecycle ([ADR-0004](../decisions/ADR-0004-BOOKING-LIFECYCLE.md)).
They were **approved as provisional defaults**; change them by updating the database functions in the
bookings migration and `src/lib/booking-options.ts` together.

## Rules implemented

| Rule                   | Value                                                                                                   | Enforced in                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Who can be booked      | Published experiences of **verified** providers at published destinations, on open future dates         | `request_booking`                       |
| Party size             | 1–20 people (adults ≥ 1)                                                                                | Form schema + `request_booking`         |
| Contact                | A phone number for this booking is required and shared with the provider; account email is never shared | `request_booking` + RLS                 |
| Seats                  | Counted on confirmation only; a date can't be overbooked                                                | `respond_to_booking` + check constraint |
| Response window        | 48 hours after the request, or the slot start if sooner; then **expired**                               | Functions + `pg_cron` sweep             |
| Price                  | Estimate at request (per-person price × party); **the provider confirms the final total**               | `request_booking`, `respond_to_booking` |
| Decline                | Provider must give a reason                                                                             | `respond_to_booking`                    |
| Traveller cancellation | A request any time; a confirmed booking up to **24 hours** before the start                             | `cancel_booking`                        |
| Provider cancellation  | Confirmed bookings only, with a reason (requests are declined instead)                                  | `cancel_booking`                        |
| Completion             | Confirmed bookings become **completed** after the slot date                                             | `pg_cron` sweep                         |
| Payment                | None. Nothing is charged through Himverse.AI                                                            | n/a                                     |

## Open questions (not decided)

1. **Payments:** deposits, full prepayment or pay-at-provider? Refund rules per cancellation timing?
   (Needs a provider decision and an ADR.)
2. **Late cancellation (< 24 h) and no-shows:** fees, provider recourse and who arbitrates disputes.
3. **Response window:** is 48 h right for all categories (e.g. multi-day treks vs short walks)?
4. **Child pricing:** children are currently estimated at the adult price.
5. **Rescheduling:** today it's cancel and rebook.
6. **Notifications:** an email/SMS provider for new requests, confirmations and expiries.
7. **Time slots:** a date plus an optional start time; multi-session days aren't modelled.
8. **Provider suspension with confirmed bookings:** confirmed bookings stay as they are. Should
   travellers be notified or offered alternatives?
