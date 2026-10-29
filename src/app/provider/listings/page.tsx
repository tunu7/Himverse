import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState, Panel } from "@/components/dashboard";
import { LoadingBlock, PageShell } from "@/components/page-shell";
import {
  AcceptsBookingsForm,
  ExperienceStatusForm,
  ListingTypeBookingsForm,
  NewExperienceForm,
} from "@/features/providers/components/provider-forms";
import {
  LISTING_TYPE_LABELS,
  LISTING_TYPES,
  type ListingType,
  listingSummaryParts,
} from "@/lib/listing-options";
import { requireAccountForPage } from "@/server/auth/session";
import { listPublishedDestinations } from "@/server/catalog/catalog";
import { getMyBusiness } from "@/server/providers/partner";
import { listMyProviders, type ProviderExperience } from "@/server/providers/providers";

const STATUS_STYLES = {
  published: "bg-accent-soft text-accent-soft-fg",
  draft: "bg-surface-muted text-muted",
  archived: "bg-surface-muted text-subtle",
} as const;

function parseType(value: string | string[] | undefined): ListingType | null {
  return LISTING_TYPES.find((t) => t === value) ?? null;
}

function ListingRow({ listing: e, verified }: { listing: ProviderExperience; verified: boolean }) {
  return (
    <li
      className="flex flex-wrap items-center justify-between gap-3 py-4"
      data-testid="listing-row"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/provider/listings/${e.id}`}
            className="font-medium text-fg hover:text-accent hover:underline"
          >
            {e.title}
          </Link>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[e.status]}`}
          >
            {e.status}
          </span>
        </div>
        <p className="text-sm text-muted">{listingSummaryParts(e).join(" · ")}</p>
        <p className="text-sm text-muted" data-testid="booking-requests-state">
          {!e.acceptsBookings
            ? "Offline: not accepting booking requests (hidden from AI trip plans)"
            : e.status === "published"
              ? e.listingType === "experience"
                ? "Online: accepting bookings on the dates you publish"
                : "Online: accepting bookings when there's capacity"
              : "Online: will accept booking requests once it goes live"}
        </p>
        {e.moderationLocked ? (
          <p className="text-sm text-warning-soft-fg">
            Unpublished by Himverse moderation. Edit it as a draft and contact us to have it
            published again.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <AcceptsBookingsForm
          experienceId={e.id}
          acceptsBookings={e.acceptsBookings}
          title={e.title}
        />
        <Link
          href={`/provider/listings/${e.id}`}
          className="inline-flex items-center rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-surface-muted"
        >
          Edit
        </Link>
        {e.status !== "published" && verified && e.destinationName && !e.moderationLocked ? (
          <ExperienceStatusForm experienceId={e.id} status="published" label="Publish" />
        ) : null}
        {e.status === "published" ? (
          <ExperienceStatusForm experienceId={e.id} status="draft" label="Unpublish" />
        ) : null}
      </div>
    </li>
  );
}

async function Listings({ searchParams }: PageProps<"/provider/listings">) {
  await requireAccountForPage("/provider/listings", ["partner"]);
  const [business, providers, destinations, params] = await Promise.all([
    getMyBusiness(),
    listMyProviders(),
    listPublishedDestinations(),
    searchParams,
  ]);
  if (!business) redirect("/provider");
  const listings = providers.find((p) => p.id === business.id)?.experiences ?? [];
  const verified = business.status === "verified";
  const active = listings.filter((l) => l.status !== "archived");
  const archived = listings.filter((l) => l.status === "archived");
  const groups = LISTING_TYPES.map((type) => ({
    type,
    items: active.filter((l) => l.listingType === type),
  })).filter((g) => g.items.length > 0);
  const addType = parseType(params.type);

  return (
    <div className="flex flex-col gap-8">
      {!verified ? (
        <p className="rounded-2xl bg-surface-muted p-4 text-sm text-fg-soft">
          You can prepare drafts now; publishing opens once your business is verified.
        </p>
      ) : null}

      {groups.length === 0 ? (
        <Panel title="Your listings (0)">
          <EmptyState
            title="No listings yet"
            body="Add your first stay, guide, transport or experience below. It stays a draft until you publish it."
          />
        </Panel>
      ) : (
        groups.map(({ type, items }) => (
          <section
            key={type}
            aria-labelledby={`listings-${type}`}
            className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5"
            data-testid={`listing-group-${type}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id={`listings-${type}`} className="text-lg font-semibold text-fg">
                  {LISTING_TYPE_LABELS[type].many} ({items.length})
                </h2>
                <p className="text-sm text-muted">
                  {items.filter((l) => l.status === "published" && l.acceptsBookings).length} taking
                  requests · {items.filter((l) => l.status === "published").length} published
                </p>
              </div>
              <ListingTypeBookingsForm
                listingType={type}
                allOnline={items.every((l) => l.acceptsBookings)}
              />
            </div>
            <ul className="flex flex-col divide-y divide-line">
              {items.map((e) => (
                <ListingRow key={e.id} listing={e} verified={verified} />
              ))}
            </ul>
          </section>
        ))
      )}

      <details
        id="add-listing"
        className="rounded-2xl border border-line bg-surface p-5"
        open={active.length === 0 || addType !== null}
      >
        <summary className="cursor-pointer font-medium">Add a listing</summary>
        <div className="pt-4">
          <NewExperienceForm
            providerId={business.id}
            destinations={destinations}
            initialType={addType ?? undefined}
          />
        </div>
      </details>

      {archived.length > 0 ? (
        <Panel title={`Archived (${archived.length})`}>
          <ul className="flex flex-col gap-1 text-sm text-muted">
            {archived.map((e) => (
              <li key={e.id}>{e.title}</li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

export default function ListingsPage(props: PageProps<"/provider/listings">) {
  return (
    <PageShell
      title="Listings"
      description="Everything travellers can find and request from you. Switch a listing offline to stop new requests without unpublishing it."
    >
      <Suspense fallback={<LoadingBlock label="Loading listings…" variant="list" />}>
        <Listings {...props} />
      </Suspense>
    </PageShell>
  );
}
