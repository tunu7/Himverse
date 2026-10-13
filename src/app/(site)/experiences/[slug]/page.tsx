import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LoadingBlock, PageMain } from "@/components/page-shell";
import { ExperienceBooking } from "@/features/bookings/components/experience-booking";
import { formatCategory, formatDuration, formatPriceFrom } from "@/lib/format";
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

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted">
          <Link
            href="/experiences"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Experiences
          </Link>{" "}
          / {formatCategory(experience.category)}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
          {experience.title}
        </h1>
        {experience.summary ? <p className="text-lg text-fg-soft">{experience.summary}</p> : null}
      </header>

      <dl className="grid gap-4 rounded-xl border border-line bg-surface shadow-xs p-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium tracking-wide text-subtle uppercase">
            Indicative price
          </dt>
          <dd className="font-medium">{price ? `From ${price}` : "Price on request"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-subtle uppercase">Duration</dt>
          <dd className="font-medium">{formatDuration(experience.durationMinutes)}</dd>
        </div>
        <div>
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
        <div>
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
          <h2 className="text-lg font-semibold">About this experience</h2>
          <p className="whitespace-pre-line text-fg-soft">{experience.description}</p>
        </section>
      ) : null}

      <p className="rounded-lg border border-line bg-surface-muted p-4 text-sm text-fg-soft">
        Prices are indicative and availability isn&apos;t guaranteed until the provider confirms
        your booking.
      </p>

      <section className="flex flex-col gap-3" aria-labelledby="book-heading">
        <h2 id="book-heading" className="text-lg font-semibold">
          Request to book
        </h2>
        <Suspense fallback={<LoadingBlock label="Loading dates…" variant="form" />}>
          <ExperienceBooking
            experienceId={experience.id}
            experienceSlug={experience.slug}
            priceFromMinor={experience.priceFromMinor}
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
