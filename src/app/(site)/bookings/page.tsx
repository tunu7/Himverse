import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { buttonClass } from "@/components/form-feedback";
import { FilterTabs } from "@/components/dashboard";
import { LoadingBlock, PageShell } from "@/components/page-shell";
import { EmptyState } from "@/components/ui";
import { TravellerTabs } from "@/features/account/components/traveller-tabs";
import { BookingStatusBadge } from "@/features/bookings/components/booking-status";
import { MarkBookingsSeen } from "@/features/bookings/components/mark-bookings-seen";
import { effectiveStatus, istDate } from "@/lib/booking-options";
import { formatBookingDates } from "@/lib/format";
import { requireAccountForPage } from "@/server/auth/session";
import { getMyBookingUpdates } from "@/server/bookings/alerts";
import { listMyBookings } from "@/server/bookings/repository";

const VIEWS = {
  all: "All",
  upcoming: "Upcoming",
  awaiting: "Awaiting reply",
  past: "Past",
  cancelled: "Cancelled and declined",
} as const;
type View = keyof typeof VIEWS;

async function BookingList({ searchParams }: PageProps<"/bookings">) {
  await requireAccountForPage("/bookings", ["traveller"]);
  await connection();
  const raw = (await searchParams).view;
  const view: View = typeof raw === "string" && raw in VIEWS ? (raw as View) : "all";
  const now = new Date();
  const today = istDate(now);
  const [mine, updated] = await Promise.all([listMyBookings(), getMyBookingUpdates()]);
  const all = mine.map((b) => ({
    ...b,
    effective: effectiveStatus(b.status, b.requestExpiresAt, now),
  }));
  const groups: Record<View, typeof all> = {
    all,
    upcoming: all.filter((b) => b.effective === "confirmed" && b.slotStartsOn >= today),
    awaiting: all.filter((b) => b.effective === "requested"),
    past: all.filter(
      (b) => b.effective === "completed" || (b.effective === "confirmed" && b.slotStartsOn < today),
    ),
    cancelled: all.filter((b) => ["cancelled", "declined", "expired"].includes(b.effective)),
  };
  const bookings = groups[view];
  const tabs = (
    <FilterTabs
      label="Booking views"
      active={view}
      hrefFor={(key) => (key === "all" ? "/bookings" : `/bookings?view=${key}`)}
      tabs={(Object.keys(VIEWS) as View[]).map((key) => ({
        key,
        label: VIEWS[key],
        count: groups[key].length,
      }))}
    />
  );
  if (all.length === 0) {
    return (
      <EmptyState title="You haven't made any bookings yet.">
        <p>Find an experience you like, pick a date and book it.</p>
        <Link href="/experiences" className={`${buttonClass} mt-3`}>
          Find an experience
        </Link>
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {updated.size > 0 ? (
        <>
          <p
            role="status"
            data-testid="booking-updates"
            className="rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-accent-soft-fg"
          >
            {updated.size === 1
              ? "1 booking has an update since your last visit."
              : `${updated.size} bookings have updates since your last visit.`}
          </p>
          <MarkBookingsSeen />
        </>
      ) : null}
      {tabs}
      {bookings.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-6 text-sm text-muted">
          No bookings in this view.
        </p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {bookings.map((b) => (
          <li
            key={b.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-5"
          >
            <div>
              <Link
                href={`/bookings/${b.id}`}
                className="font-semibold text-fg underline-offset-4 hover:text-accent hover:underline"
              >
                {b.experienceTitle}
              </Link>
              {updated.has(b.id) ? (
                <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-soft-fg">
                  Updated
                </span>
              ) : null}
              {b.effective === "confirmed" &&
              b.deposit &&
              !b.deposit.paidAt &&
              new Date(b.deposit.dueAt) > now ? (
                <span
                  data-testid="deposit-due"
                  className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning-soft-fg"
                >
                  Deposit due
                </span>
              ) : null}
              <p className="text-sm text-muted">
                {formatBookingDates(b.slotStartsOn, b.slotStartTime, b.endsOn, b.listingType)} ·{" "}
                {b.partySize} {b.partySize === 1 ? "person" : "people"} · {b.reference}
              </p>
            </div>
            <BookingStatusBadge
              status={b.status}
              requestExpiresAt={b.requestExpiresAt}
              now={now}
              priceProposed={b.proposedTotalMinor !== null}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function BookingsPage(props: PageProps<"/bookings">) {
  return (
    <PageShell title="Your bookings">
      <TravellerTabs active="bookings" />
      <Suspense fallback={<LoadingBlock label="Loading your bookings…" variant="list" />}>
        <BookingList {...props} />
      </Suspense>
    </PageShell>
  );
}
