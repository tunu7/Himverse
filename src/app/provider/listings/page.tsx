import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState, Panel } from "@/components/dashboard";
import { LoadingBlock, PageShell } from "@/components/page-shell";
import {
  AcceptsBookingsForm,
  ExperienceStatusForm,
  NewExperienceForm,
} from "@/features/providers/components/provider-forms";
import { formatDuration, formatPriceFrom } from "@/lib/format";
import { requireAccountForPage } from "@/server/auth/session";
import { listPublishedDestinations } from "@/server/catalog/catalog";
import { getMyBusiness } from "@/server/providers/partner";
import { listMyProviders } from "@/server/providers/providers";

const STATUS_STYLES = {
  published: "bg-accent-soft text-accent-soft-fg",
  draft: "bg-surface-muted text-muted",
  archived: "bg-surface-muted text-subtle",
} as const;

async function Listings() {
  await requireAccountForPage("/provider/listings", ["partner"]);
  const [business, providers, destinations] = await Promise.all([
    getMyBusiness(),
    listMyProviders(),
    listPublishedDestinations(),
  ]);
  if (!business) redirect("/provider");
  const listings = providers.find((p) => p.id === business.id)?.experiences ?? [];
  const verified = business.status === "verified";
  const active = listings.filter((l) => l.status !== "archived");
  const archived = listings.filter((l) => l.status === "archived");

  return (
    <div className="flex flex-col gap-8">
      {!verified ? (
        <p className="rounded-2xl bg-surface-muted p-4 text-sm text-fg-soft">
          You can prepare drafts now; publishing opens once your business is verified.
        </p>
      ) : null}

      <Panel title={`Your listings (${active.length})`}>
        {active.length === 0 ? (
          <EmptyState
            title="No listings yet"
            body="Add your first experience below. It stays a draft until you publish it."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {active.map((e) => {
              const price = formatPriceFrom(e.priceFromMinor);
              return (
                <li
                  key={e.id}
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
                    <p className="text-sm text-muted">
                      {e.destinationName ?? "destination not published"} ·{" "}
                      {formatDuration(e.durationMinutes)}
                      {price ? ` · from ${price}` : ""}
                    </p>
                    <p className="text-sm text-muted" data-testid="booking-requests-state">
                      {e.acceptsBookings
                        ? "Accepting booking requests for any date"
                        : "Not accepting booking requests (hidden from AI trip plans)"}
                    </p>
                    {e.moderationLocked ? (
                      <p className="text-sm text-warning-soft-fg">
                        Unpublished by Himverse moderation. Edit it as a draft and contact us to
                        have it published again.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/provider/listings/${e.id}`}
                      className="inline-flex items-center rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-surface-muted"
                    >
                      Edit
                    </Link>
                    <AcceptsBookingsForm experienceId={e.id} acceptsBookings={e.acceptsBookings} />
                    {e.status !== "published" &&
                    verified &&
                    e.destinationName &&
                    !e.moderationLocked ? (
                      <ExperienceStatusForm
                        experienceId={e.id}
                        status="published"
                        label="Publish"
                      />
                    ) : null}
                    {e.status === "published" ? (
                      <ExperienceStatusForm experienceId={e.id} status="draft" label="Unpublish" />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <details className="rounded-2xl border border-line bg-surface p-5" open={active.length === 0}>
        <summary className="cursor-pointer font-medium">Add a listing</summary>
        <div className="pt-4">
          <NewExperienceForm providerId={business.id} destinations={destinations} />
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

export default function ListingsPage() {
  return (
    <PageShell title="Listings" description="Everything travellers can find and request from you.">
      <Suspense fallback={<LoadingBlock label="Loading listings…" variant="list" />}>
        <Listings />
      </Suspense>
    </PageShell>
  );
}
