import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { EmptyState, Panel } from "@/components/dashboard";
import { LoadingBlock, PageShell } from "@/components/page-shell";
import { AddSlotForm, SlotStatusButton } from "@/features/bookings/components/booking-forms";
import { ListingEditForm } from "@/features/providers/components/partner-forms";
import {
  AcceptsBookingsForm,
  ExperienceStatusForm,
} from "@/features/providers/components/provider-forms";
import { formatSlot } from "@/lib/format";
import { requireAccountForPage } from "@/server/auth/session";
import { listSlotsForExperiences } from "@/server/bookings/repository";
import { listPublishedDestinations } from "@/server/catalog/catalog";
import { todayInTripZone } from "@/server/itineraries/preferences";
import { getMyBusiness, getMyListing } from "@/server/providers/partner";

async function EditListing({ params }: PageProps<"/provider/listings/[id]">) {
  const { id } = await params;
  await requireAccountForPage(`/provider/listings/${id}`, ["partner"]);
  const [listing, business, destinations, slots] = await Promise.all([
    getMyListing(id),
    getMyBusiness(),
    listPublishedDestinations(),
    listSlotsForExperiences([id]),
  ]);
  if (!listing || !business || listing.providerId !== business.id) notFound();
  const verified = business.status === "verified";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          <Link href="/provider/listings" className="font-medium text-accent hover:underline">
            Listings
          </Link>{" "}
          · {listing.title} · <span className="font-medium text-fg">{listing.status}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {listing.status === "published" ? (
            <Link
              href={`/experiences/${listing.slug}`}
              className="inline-flex items-center rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-surface-muted"
            >
              View public page
            </Link>
          ) : null}
          <AcceptsBookingsForm
            experienceId={listing.id}
            acceptsBookings={listing.acceptsBookings}
            title={listing.title}
          />
          {listing.status !== "published" && verified && !listing.moderationLocked ? (
            <ExperienceStatusForm experienceId={listing.id} status="published" label="Publish" />
          ) : null}
          {listing.status === "published" ? (
            <ExperienceStatusForm experienceId={listing.id} status="draft" label="Unpublish" />
          ) : null}
          {listing.status !== "archived" ? (
            <ExperienceStatusForm experienceId={listing.id} status="archived" label="Archive" />
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Panel title="Details">
          <ListingEditForm
            listing={{
              id: listing.id,
              title: listing.title,
              slug: listing.slug,
              summary: listing.summary,
              description: listing.description,
              category: listing.category,
              destinationId: listing.destinationId,
              durationMinutes: listing.durationMinutes,
              priceFromMinor: listing.priceFromMinor,
              listingType: listing.listingType,
              priceUnit: listing.priceUnit,
              dailyCapacity: listing.dailyCapacity,
              maxGuests: listing.maxGuests,
              languages: listing.languages,
              routeToDestinationId: listing.routeToDestinationId,
            }}
            destinations={destinations}
          />
        </Panel>
        {listing.listingType === "experience" ? (
          <Panel title="Dates with limited seats">
            <p className="text-sm text-muted">
              {listing.acceptsBookings
                ? "Travellers can request any future date. Publish a date here only to cap the seats on it."
                : "Booking requests are off for this listing."}
            </p>
            <div data-testid="slot-manager" className="flex flex-col gap-3">
              {slots.length === 0 ? (
                <EmptyState title="No dates published" />
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {slots.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {formatSlot(s.startsOn, s.startTime)} · {s.capacity - s.seatsLeft}/
                        {s.capacity} confirmed · {s.status}
                      </span>
                      <SlotStatusButton slotId={s.id} status={s.status} />
                    </li>
                  ))}
                </ul>
              )}
              {verified ? (
                <AddSlotForm experienceId={listing.id} minDate={todayInTripZone(new Date())} />
              ) : (
                <p className="text-xs text-subtle">Dates can be added once you&apos;re verified.</p>
              )}
            </div>
          </Panel>
        ) : (
          <Panel title="Availability">
            <p className="text-sm text-muted">
              Travellers request dates; each day can take up to the capacity set in the details.
              Confirming a request checks capacity for every day it covers.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}

export default function EditListingPage(props: PageProps<"/provider/listings/[id]">) {
  return (
    <PageShell title="Edit listing">
      <Suspense fallback={<LoadingBlock label="Loading listing…" variant="form" />}>
        <EditListing {...props} />
      </Suspense>
    </PageShell>
  );
}
