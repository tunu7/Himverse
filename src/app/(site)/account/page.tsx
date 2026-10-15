import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { EmptyState, Panel, StatCard, StatGrid } from "@/components/dashboard";
import { buttonClass, secondaryButtonClass } from "@/components/form-feedback";
import { LoadingBlock, PageShell } from "@/components/page-shell";
import { TravellerTabs } from "@/features/account/components/traveller-tabs";
import { BookingStatusBadge } from "@/features/bookings/components/booking-status";
import { effectiveStatus, istDate } from "@/lib/booking-options";
import { formatBookingDates } from "@/lib/format";
import { requireAccountForPage } from "@/server/auth/session";
import { listMyBookings } from "@/server/bookings/repository";
import { listMyItineraries } from "@/server/itineraries/repository";
import { getMyProfile } from "@/server/profiles/profiles";

/** The traveller's home: what's next, what's waiting, and quick ways onward. */
async function Overview() {
  await requireAccountForPage("/account", ["traveller"]);
  await connection();
  const now = new Date();
  const today = istDate(now);
  const [profile, bookings, trips] = await Promise.all([
    getMyProfile(),
    listMyBookings(),
    listMyItineraries(),
  ]);
  const withStatus = bookings.map((b) => ({
    ...b,
    effective: effectiveStatus(b.status, b.requestExpiresAt, now),
  }));
  const upcoming = withStatus
    .filter((b) => b.effective === "confirmed" && b.slotStartsOn >= today)
    .sort((a, b) => a.slotStartsOn.localeCompare(b.slotStartsOn));
  const waiting = withStatus.filter((b) => b.effective === "requested");
  const next = upcoming[0];

  return (
    <div className="flex flex-col gap-8">
      <p className="text-xl font-semibold text-fg">Hello, {profile.displayName}.</p>
      <StatGrid>
        <StatCard
          label="Upcoming bookings"
          value={upcoming.length}
          hint="Confirmed by partners"
          href="/bookings?view=upcoming"
        />
        <StatCard
          label="Awaiting reply"
          value={waiting.length}
          hint="Partners reply within 48 hours"
          href="/bookings?view=awaiting"
          tone={waiting.length > 0 ? "attention" : "default"}
        />
        <StatCard
          label="Trip plans"
          value={trips.length}
          hint="Saved AI itineraries"
          href="/itineraries"
        />
        <StatCard
          label="All bookings"
          value={bookings.length}
          hint="Including past and cancelled"
          href="/bookings?view=all"
        />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Panel title="Next up">
          {next ? (
            <div
              className="flex flex-wrap items-center justify-between gap-3"
              data-testid="next-booking"
            >
              <div>
                <Link
                  href={`/bookings/${next.id}`}
                  className="text-lg font-semibold text-fg hover:text-accent hover:underline"
                >
                  {next.experienceTitle}
                </Link>
                <p className="text-sm text-muted">
                  {formatBookingDates(next.slotStartsOn, next.slotStartTime, next.endsOn)} ·{" "}
                  {next.partySize} {next.partySize === 1 ? "person" : "people"} · {next.reference}
                </p>
              </div>
              <BookingStatusBadge
                status={next.status}
                requestExpiresAt={next.requestExpiresAt}
                now={now}
              />
            </div>
          ) : (
            <EmptyState
              title="Nothing booked yet"
              body="Plan a trip with AI or browse experiences, then request the dates you want."
              action={
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link href="/itineraries/new" className={buttonClass}>
                    Plan a trip
                  </Link>
                  <Link href="/experiences" className={secondaryButtonClass}>
                    Browse experiences
                  </Link>
                </div>
              }
            />
          )}
        </Panel>
        <Panel
          title="Recent trip plans"
          action={
            <Link
              href="/itineraries/new"
              className="text-sm font-medium text-accent hover:underline"
            >
              New plan
            </Link>
          }
        >
          {trips.length === 0 ? (
            <p className="text-sm text-muted">No plans yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {trips.slice(0, 4).map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/itineraries/${t.id}`}
                    className="font-medium text-fg hover:text-accent hover:underline"
                  >
                    {t.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <PageShell title="Your travel">
      <TravellerTabs active="overview" />
      <Suspense fallback={<LoadingBlock label="Loading your dashboard…" variant="cards" />}>
        <Overview />
      </Suspense>
    </PageShell>
  );
}
