import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { buttonClass } from "@/components/form-feedback";
import { LoadingBlock, PageMain } from "@/components/page-shell";
import { DestinationBand } from "@/features/discovery/components/destination-card";
import { ExperienceCard } from "@/features/discovery/components/experience-card";
import { experiencesHref } from "@/features/discovery/search-params";
import { getPublicDestination } from "@/server/catalog/catalog";

export async function generateMetadata({
  params,
}: PageProps<"/destinations/[slug]">): Promise<Metadata> {
  const destination = await getPublicDestination((await params).slug);
  return destination
    ? { title: `${destination.name} · Himverse.AI`, description: destination.summary || undefined }
    : { title: "Destination not found · Himverse.AI" };
}

async function DestinationDetail({ params }: PageProps<"/destinations/[slug]">) {
  const destination = await getPublicDestination((await params).slug);
  if (!destination) {
    notFound();
  }

  return (
    <article className="flex flex-col gap-10">
      <DestinationBand slug={destination.slug} className="h-40 rounded-3xl sm:h-56" />
      <header className="-mt-2 flex flex-col gap-3">
        <p className="text-sm text-muted">
          <Link
            href="/destinations"
            className="font-medium text-fg-soft transition-colors hover:text-accent"
          >
            Destinations
          </Link>{" "}
          / {destination.district} district
        </p>
        <h1 className="text-4xl font-semibold tracking-[-0.035em] text-fg sm:text-6xl">
          {destination.name}
        </h1>
        {destination.summary ? (
          <p className="max-w-2xl text-lg leading-8 text-muted">{destination.summary}</p>
        ) : null}
      </header>

      {destination.description ? (
        <p className="max-w-3xl leading-7 whitespace-pre-line text-fg-soft">
          {destination.description}
        </p>
      ) : null}

      <aside className="reveal flex flex-col items-start gap-4 rounded-3xl border border-accent/15 bg-accent-soft p-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-accent-soft-fg">
          Want a day-by-day plan for {destination.name}? Our AI planner builds one from these
          experiences.
        </p>
        <Link href="/itineraries/new" className={`${buttonClass} shrink-0`}>
          Plan a trip
        </Link>
      </aside>

      <section className="flex flex-col gap-4" aria-labelledby="destination-experiences">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="destination-experiences" className="text-2xl font-semibold tracking-[-0.02em]">
            Experiences in {destination.name}
          </h2>
          {destination.experiences.length > 0 ? (
            <Link
              href={experiencesHref({ district: destination.district, sort: "newest", page: 1 })}
              className="text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              All experiences in {destination.district}
            </Link>
          ) : null}
        </div>
        {destination.experiences.length === 0 ? (
          <p className="text-muted">No experiences are published here yet.</p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {destination.experiences.map((experience) => (
              <ExperienceCard key={experience.id} experience={experience} />
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

export default function DestinationPage(props: PageProps<"/destinations/[slug]">) {
  return (
    <PageMain>
      <Suspense fallback={<LoadingBlock label="Loading destination…" variant="detail" />}>
        <DestinationDetail {...props} />
      </Suspense>
    </PageMain>
  );
}
