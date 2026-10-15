import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LoadingBlock, PageMain } from "@/components/page-shell";
import { ExperienceBooking } from "@/features/bookings/components/experience-booking";
import { CategoryBand } from "@/features/discovery/components/category-visual";
import { formatCategory, formatDuration, formatPriceFrom } from "@/lib/format";
import { CAPACITY_LABELS, LISTING_TYPE_LABELS, PRICE_UNIT_LABELS } from "@/lib/listing-options";
import { getPublicExperience } from "@/server/catalog/catalog";

export async function generateMetadata({
  params,
}: PageProps<"/experiences/[slug]">): Promise<Metadata> {
  const experience = await getPublicExperience((await params).slug);
  return experience
    ? { title: `${experience.title} · Himverse.AI`, description: experience.summary || undefined }
    : { title: "Experience not found · Himverse.AI" };
}

async function ExperienceDetail({ params }: PageProps<"/experiences/[slug]">) {
  const experience = await getPublicExperience((await params).slug);
  if (!experience) {
    notFound();
  }
  const price = formatPriceFrom(experience.priceFromMinor);
  const type = experience.listingType;
  const typeLabel = LISTING_TYPE_LABELS[type];

  return (
    <article className="flex flex-col gap-8">
      <CategoryBand category={experience.category} className="h-44 rounded-3xl sm:h-60" />
      <header className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          <Link
            href={typeLabel.path}
            className="font-medium text-fg-soft transition-colors hover:text-accent"
          >
            {typeLabel.many}
          </Link>{" "}
          / {formatCategory(experience.category)}
        </p>
        <h1 className="text-4xl font-semibold tracking-[-0.035em] text-fg sm:text-5xl">
          {experience.title}
        </h1>
        {experience.summary ? (
          <p className="text-lg leading-8 text-muted">{experience.summary}</p>
        ) : null}
      </header>

      <dl className="grid gap-px sm:grid-cols-2 overflow-hidden rounded-3xl border border-line bg-line">
        <div className="flex flex-col gap-1 bg-surface p-5">
          <dt className="text-xs font-medium tracking-wide text-subtle uppercase">
            Indicative price
          </dt>
          <dd className="font-medium" data-testid="listing-price">
            {price
              ? `From ${price} ${PRICE_UNIT_LABELS[experience.priceUnit]}`
              : "Price on request"}
          </dd>
        </div>
        {type === "experience" ? (
          <div className="flex flex-col gap-1 bg-surface p-5">
            <dt className="text-xs font-medium tracking-wide text-subtle uppercase">Duration</dt>
            <dd className="font-medium">{formatDuration(experience.durationMinutes)}</dd>
          </div>
        ) : (
          <div className="flex flex-col gap-1 bg-surface p-5">
            <dt className="text-xs font-medium tracking-wide text-subtle uppercase">
              {CAPACITY_LABELS[type].perUnit}
            </dt>
            <dd className="font-medium">
              Up to {experience.maxGuests} · {experience.dailyCapacity}{" "}
              {experience.dailyCapacity === 1
                ? CAPACITY_LABELS[type].unitOne
                : `${CAPACITY_LABELS[type].unitOne}s`}{" "}
              available
            </dd>
          </div>
        )}
        {type === "transport" && experience.routeTo ? (
          <div className="flex flex-col gap-1 bg-surface p-5">
            <dt className="text-xs font-medium tracking-wide text-subtle uppercase">Route</dt>
            <dd className="font-medium">
              {experience.destination.name} → {experience.routeTo.name}
            </dd>
          </div>
        ) : null}
        {type === "guide" && experience.languages.length > 0 ? (
          <div className="flex flex-col gap-1 bg-surface p-5">
            <dt className="text-xs font-medium tracking-wide text-subtle uppercase">Languages</dt>
            <dd className="font-medium">{experience.languages.join(", ")}</dd>
          </div>
        ) : null}
        <div className="flex flex-col gap-1 bg-surface p-5">
          <dt className="text-xs font-medium tracking-wide text-subtle uppercase">Location</dt>
          <dd className="font-medium">
            <Link
              href={`/destinations/${experience.destination.slug}`}
              className="font-medium text-accent underline-offset-4 hover:underline"
            >
              {experience.destination.name}
            </Link>
            , {experience.destination.district}
          </dd>
        </div>
        <div className="flex flex-col gap-1 bg-surface p-5">
          <dt className="text-xs font-medium tracking-wide text-subtle uppercase">Provider</dt>
          <dd className="font-medium">
            {experience.provider.displayName}
            {experience.provider.district ? ` (${experience.provider.district})` : null}
            <span className="ml-2 inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-soft-fg">
              Verified
            </span>
          </dd>
        </div>
      </dl>

      {experience.description ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold tracking-tight">About this experience</h2>
          <p className="leading-7 whitespace-pre-line text-fg-soft">{experience.description}</p>
        </section>
      ) : null}

      <p className="rounded-2xl bg-surface-muted p-4 text-sm text-fg-soft">
        Prices are indicative and availability isn&apos;t guaranteed until the provider confirms
        your booking.
      </p>

      <section
        className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-5 sm:p-7"
        aria-labelledby="book-heading"
      >
        <h2 id="book-heading" className="text-xl font-semibold tracking-tight">
          Request to book
        </h2>
        <Suspense fallback={<LoadingBlock label="Loading dates…" variant="form" />}>
          <ExperienceBooking
            experienceId={experience.id}
            experienceSlug={experience.slug}
            priceFromMinor={experience.priceFromMinor}
            acceptsBookings={experience.acceptsBookings}
            listing={{
              type: experience.listingType,
              priceUnit: experience.priceUnit,
              dailyCapacity: experience.dailyCapacity,
              maxGuests: experience.maxGuests,
            }}
          />
        </Suspense>
      </section>
    </article>
  );
}

export default function ExperiencePage(props: PageProps<"/experiences/[slug]">) {
  return (
    <PageMain width="narrow">
      <Suspense fallback={<LoadingBlock label="Loading experience…" variant="detail" />}>
        <ExperienceDetail {...props} />
      </Suspense>
    </PageMain>
  );
}
