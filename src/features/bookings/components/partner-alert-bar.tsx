import Link from "next/link";

import { getCurrentAccount } from "@/server/auth/session";
import { getPartnerAlerts } from "@/server/bookings/alerts";

/**
 * On every partner-portal page: instant bookings from the last 48 hours, and
 * any requests still waiting for a reply (listings without a price), before
 * they expire.
 */
export async function PartnerAlertBar() {
  const account = await getCurrentAccount();
  if (account?.accountType !== "partner") return null;
  const { needsResponse, expiringSoon, newBookings } = await getPartnerAlerts();
  if (needsResponse === 0 && newBookings === 0) return null;
  return (
    <div className="flex flex-col gap-3 px-4 pt-6 sm:px-6 lg:px-0">
      {newBookings > 0 ? (
        <p
          role="status"
          data-testid="partner-new-bookings"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-accent-soft-fg"
        >
          <span>
            <strong>
              {newBookings} new {newBookings === 1 ? "booking" : "bookings"}
            </strong>{" "}
            in the last 48 hours, confirmed automatically.
          </span>
          <Link
            href="/provider/bookings?view=upcoming"
            className="font-semibold underline underline-offset-4"
          >
            See bookings
          </Link>
        </p>
      ) : null}
      {needsResponse > 0 ? (
        <p
          role="status"
          data-testid="partner-alerts"
          className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm ${
            expiringSoon > 0
              ? "border-warning-line bg-warning-soft text-warning-soft-fg"
              : "border-accent/30 bg-accent-soft text-accent-soft-fg"
          }`}
        >
          <span>
            <strong>
              {needsResponse} booking {needsResponse === 1 ? "request needs" : "requests need"} your
              reply.
            </strong>{" "}
            {expiringSoon > 0
              ? `${expiringSoon} ${expiringSoon === 1 ? "expires" : "expire"} within 12 hours.`
              : "Requests expire 48 hours after they're sent."}
          </span>
          <Link
            href="/provider/bookings?view=needs-response"
            className="font-semibold underline underline-offset-4"
          >
            Review requests
          </Link>
        </p>
      ) : null}
    </div>
  );
}
