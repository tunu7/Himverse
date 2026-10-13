import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { cardClass } from "@/components/form-feedback";
import { LoadingBlock, PageShell } from "@/components/page-shell";
import { EmptyState } from "@/components/ui";
import { BookingStatusBadge } from "@/features/bookings/components/booking-status";
import { BOOKING_STATUS_LABELS, type BookingStatus } from "@/lib/booking-options";
import { formatSlot } from "@/lib/format";
import { listAllBookings } from "@/server/admin/admin";
import { requireAdminForPage } from "@/server/auth/session";

export const metadata: Metadata = { title: "Bookings · Admin", robots: { index: false } };

const STATUSES = Object.keys(BOOKING_STATUS_LABELS) as BookingStatus[];

async function Bookings({ searchParams }: PageProps<"/admin/bookings">) {
  await requireAdminForPage("/admin/bookings");
  await connection();
  const raw = (await searchParams).status;
  const status = STATUSES.find((s) => s === raw);
  const bookings = await listAllBookings({ status });
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Filter bookings" className="flex flex-wrap gap-2">
        {[undefined, ...STATUSES].map((s) => {
          const active = s === status;
          return (
            <Link
              key={s ?? "all"}
              href={s ? `/admin/bookings?status=${s}` : "/admin/bookings"}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                active
                  ? "border-accent bg-accent-soft text-accent-soft-fg"
                  : "border-line-strong text-fg-soft hover:bg-surface-muted"
              }`}
            >
              {s ? BOOKING_STATUS_LABELS[s].split(" (")[0] : "All"}
            </Link>
          );
        })}
      </nav>

      {bookings.length === 0 ? (
        <EmptyState title="No bookings here yet.">
          <p>Booking requests from travellers will appear here.</p>
        </EmptyState>
      ) : (
        <div className={`${cardClass} overflow-x-auto`}>
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-xs tracking-wide text-subtle uppercase">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Reference
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Experience
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Provider
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Date
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  People
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {bookings.map((b) => (
                <tr key={b.id} className="hover:bg-surface-muted/60">
                  <td className="px-4 py-3 font-mono text-xs text-fg">{b.reference}</td>
                  <td className="px-4 py-3 text-fg">{b.experienceTitle}</td>
                  <td className="px-4 py-3 text-muted">{b.providerName}</td>
                  <td className="px-4 py-3 text-muted">{formatSlot(b.slotStartsOn, null)}</td>
                  <td className="px-4 py-3 text-muted">{b.partySize}</td>
                  <td className="px-4 py-3">
                    <BookingStatusBadge
                      status={b.status}
                      requestExpiresAt={b.requestExpiresAt}
                      now={now}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {bookings.length === 200 ? (
        <p className="text-sm text-subtle">Showing the 200 most recent bookings.</p>
      ) : null}
    </div>
  );
}

export default function AdminBookingsPage(props: PageProps<"/admin/bookings">) {
  return (
    <PageShell
      title="Bookings"
      description="All booking requests across providers (read-only). Traveller contact details are visible only to the booking's provider."
    >
      <Suspense fallback={<LoadingBlock label="Loading bookings…" variant="list" />}>
        <Bookings {...props} />
      </Suspense>
    </PageShell>
  );
}
