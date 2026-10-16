# Booking Policy (provisional)

Business rules behind the booking lifecycle ([ADR-0004](../decisions/ADR-0004-BOOKING-LIFECYCLE.md)).
They were **approved as provisional defaults**; change them by updating the database functions in the
bookings migration and `src/lib/booking-options.ts` together.

## Rules implemented

| Rule | Value | Enforced in |
| --- | --- | --- |
| Who can be booked | Published experiences of **verified** providers at published destinations whose provider **accepts booking requests** (default on; partner switch), on any date from tomorrow | `request_booking_on_date` |
| Dates | Any future date. An open published slot on that date is used (seat limits apply); otherwise the provider confirms availability | `request_booking_on_date` |
| Guides, stays, transport | Booked for a date range and a quantity (guides, rooms, vehicles). Capacity per day is checked when requested and enforced when confirmed. Stays at most 30 nights, others at most 14 days | `request_listing_booking`, `respond_to_booking` |
| Whole trip | The itinerary owner can request every item at once, on each item's day, for the trip's travellers; consecutive nights at one stay, and consecutive days with one guide, each become one booking; each request succeeds or fails on its own | `request_itinerary_bookings` |
| Request limits | 30 per hour, 60 per day, 40 awaiting a response, per traveller | Insert trigger |
| Party size | 1–20 people (adults ≥ 1) | Form schema + `request_booking` |
| Contact | A phone number for this booking is required and shared with the provider; account email is never shared | `request_booking` + RLS |
| Seats | Counted on confirmation only; a date can't be overbooked | `respond_to_booking` + check constraint |
| Response window | 48 hours after the request, or the slot start if sooner; then **expired** | Functions + `pg_cron` sweep |
| Price | Estimate at request (per-person price × party); **the provider confirms the final total** | `request_booking`, `respond_to_booking` |
| Decline | Provider must give a reason | `respond_to_booking` |
| Traveller cancellation | A request any time; a confirmed booking up to **24 hours** before the start | `cancel_booking` |
| Provider cancellation | Confirmed bookings only, with a reason (requests are declined instead) | `cancel_booking` |
| Completion | Confirmed bookings become **completed** after the slot date | `pg_cron` sweep |
| Payment | When an admin requires deposits: 50% of the confirmed total, paid online (Razorpay) within 24 h of confirmation or by the start; unpaid → cancelled by the system. The rest is paid to the partner on the day ([ADR-0005](../decisions/ADR-0005-PAYMENTS-RAZORPAY.md)) | `bookings_c_deposit_terms`, `cancel_unpaid_bookings` |
| Deposit refunds | Traveller cancels 7+ days before the start → full; 7 days–24 h → 50%; partner or system cancellation → full; late or duplicate payments → full | `refund_on_cancellation`, `record_razorpay_payment` |

## Open questions (not decided)

1. **Payments:** _answered 2026-10-15_ (ADR-0005): 50% deposit, refund tiers above, Himverse
   collects and pays partners out manually. Open: a platform commission, if any.
2. **Late cancellation (< 24 h) and no-shows:** fees, provider recourse and who arbitrates disputes.
3. **Response window:** is 48 h right for all categories (e.g. multi-day treks vs short walks)?
4. **Child pricing:** children are currently estimated at the adult price.
5. **Rescheduling:** today it's cancel and rebook.
6. **Notifications:** an email/SMS provider for new requests, confirmations and expiries.
7. **Time slots:** a date plus an optional start time; multi-session days aren't modelled.
8. **Provider suspension with confirmed bookings:** confirmed bookings stay as they are. Should
   travellers be notified or offered alternatives?
9. **Final price vs estimate:** the provider can confirm any total up to INR 1 crore (a database cap),
   even far above the estimate, and the traveller only sees it after confirmation. Should a large
   increase need the traveller's acceptance, or be capped relative to the estimate? (Security review
   L1, Phase 5.)
10. **Contact phone retention:** the phone number given at booking stays on the booking indefinitely and
    is visible to the provider's members. How long should it be kept after the trip, and should it be
    hidden once the booking is closed? Needs the DPDP review. (Security review L3, Phase 5.)
    _Partly answered (ADR-0009):_ deleting the account clears the phone, name and note from every
    booking; retention for travellers who keep their account is still open.
