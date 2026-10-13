import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LoadingBlock, PageMain } from "@/components/page-shell";
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
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted">
          <Link
            href="/destinations"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Destinations
          </Link>{" "}
          / {destination.district} district
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
          {destination.name}
        </h1>
        {destination.summary ? <p className="text-lg text-fg-soft">{destination.summary}</p> : null}
      </header>

      {destination.description ? (
        <p className="whitespace-pre-line text-fg-soft">{destination.description}</p>
      ) : null}

      <section className="flex flex-col gap-4" aria-labelledby="destination-experiences">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="destination-experiences" className="text-xl font-semibold">
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
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
