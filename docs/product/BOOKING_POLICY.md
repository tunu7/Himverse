# Booking Policy (provisional)

Business rules behind the booking lifecycle ([ADR-0004](../decisions/ADR-0004-BOOKING-LIFECYCLE.md)).
They were **approved as provisional defaults**; change them by updating the database functions in the
bookings migration and `src/lib/booking-options.ts` together.

## Rules implemented

| Rule | Value | Enforced in |
| --- | --- | --- |
| Who can be booked | Published listings of **verified** providers at published destinations whose provider **accepts bookings** (default on; partner switch), from tomorrow | `request_booking_on_date`, `request_listing_booking` |
| Instant booking | A listing with a price is **confirmed when booked**, at the listed price, if there is room; no partner response (owner decision 2026-10-29, ADR-0004 amendment). A listing without a price stays a request: the partner sets the total and the traveller accepts it | `private.instant_confirm` |
| Experience dates | **Only dates the provider published** as open slots; seat limits apply. Other dates are refused | `request_booking_on_date` |
| Guides, stays, transport | Booked for a date range and a quantity (guides, rooms, vehicles). Capacity per day is checked under a lock when booked. Stays at most 30 nights, others at most 14 days | `request_listing_booking` |
| Whole trip | The itinerary owner can book every item at once, on each item's day, for the trip's travellers; consecutive nights at one stay, and consecutive days with one guide, each become one booking; each succeeds or fails on its own | `request_itinerary_bookings` |
| Request limits | 30 per hour, 60 per day, 40 awaiting a response, per traveller | Insert trigger |
| Party size | 1–20 people (adults ≥ 1) | Form schema + `request_booking` |
| Contact | A phone number for this booking is required and shared with the provider; account email is never shared | `request_booking` + RLS |
| Seats | Counted on confirmation only; a date can't be overbooked | `respond_to_booking` + check constraint |
| Response window | Requests only (listings without a price): 48 hours after the request, or the slot start if sooner; then **expired** | Functions + `pg_cron` sweep |
| Price | Estimate at booking (listed price × party, units, days), which becomes the confirmed total. Without a listed price, **the provider sets the total** | `request_booking`, `respond_to_booking` |
| Price approval | A final total more than **10% above the estimate**, or any total when there was no estimate, is a proposal: the booking stays a request until the traveller accepts (48 h, or until the start). Declining = cancelling the request (the partner can also decline); no answer = expired. One proposal per request, so a request stays open at most ~96 h. A deposit, when required, is due after acceptance | `respond_to_booking`, `accept_booking_price`, sweep |
| Decline | Provider must give a reason | `respond_to_booking` |
| Traveller cancellation | A request any time; a confirmed booking up to **24 hours** before the start | `cancel_booking` |
| Provider cancellation | Confirmed bookings only, with a reason (requests are declined instead) | `cancel_booking` |
| Completion | Confirmed bookings become **completed** after the slot date | `pg_cron` sweep |
| Payment | When an admin requires deposits: 50% of the confirmed total, paid online (Razorpay) within **1 hour** of an instant booking (24 h after a partner confirms a request) or by the start; unpaid → cancelled by the system. The rest is paid to the partner on the day ([ADR-0005](../decisions/ADR-0005-PAYMENTS-RAZORPAY.md)) | `bookings_c_deposit_terms`, `cancel_unpaid_bookings` |
| Deposit refunds | Traveller cancels 7+ days before the start → full; 7 days–24 h → 50%; partner or system cancellation → full; late or duplicate payments → full | `refund_on_cancellation`, `record_razorpay_payment` |

## Open questions (not decided)

1. **Payments:** _answered 2026-10-15_ (ADR-0005): 50% deposit, refund tiers above, Himverse
   collects and pays partners out manually. Open: a platform commission, if any.
2. **Late cancellation (< 24 h) and no-shows:** fees, provider recourse and who arbitrates disputes.
3. **Response window:** is 48 h right for all categories (e.g. multi-day treks vs short walks)?
4. **Child pricing:** children are currently estimated at the adult price.
5. **Rescheduling:** today it's cancel and rebook.
6. **Notifications:** an email/SMS provider for new bookings, requests, confirmations and expiries. Until
   then partners see new instant bookings only in the partner portal.
7. **Time slots:** a date plus an optional start time; multi-session days aren't modelled.
8. **Provider suspension with confirmed bookings:** confirmed bookings stay as they are. Should
   travellers be notified or offered alternatives?
9. **Final price vs estimate:** _Answered 2026-10-15 (owner):_ up to 10% above the estimate confirms
   directly; more than that, or any total without an estimate, needs the traveller's acceptance
   (see "Price approval" above and the ADR-0004 amendment). (Security review L1, Phase 5.)
10. **Contact phone retention:** the phone number given at booking stays on the booking indefinitely and
    is visible to the provider's members. How long should it be kept after the trip, and should it be
    hidden once the booking is closed? Needs the DPDP review. (Security review L3, Phase 5.)
    _Partly answered (ADR-0009):_ deleting the account clears the phone, name and note from every
    booking; retention for travellers who keep their account is still open.
