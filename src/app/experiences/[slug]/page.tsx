import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LoadingBlock } from "@/components/page-shell";
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
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/experiences" className="underline">
            Experiences
          </Link>{" "}
          / {formatCategory(experience.category)}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {experience.title}
        </h1>
        {experience.summary ? (
          <p className="text-lg text-zinc-700 dark:text-zinc-300">{experience.summary}</p>
        ) : null}
      </header>

      <dl className="grid gap-4 rounded-lg border border-zinc-200 p-4 sm:grid-cols-2 dark:border-zinc-800">
        <div>
          <dt className="text-sm text-zinc-500">Indicative price</dt>
          <dd className="font-medium">{price ? `From ${price}` : "Price on request"}</dd>
        </div>
        <div>
          <dt className="text-sm text-zinc-500">Duration</dt>
          <dd className="font-medium">{formatDuration(experience.durationMinutes)}</dd>
        </div>
        <div>
          <dt className="text-sm text-zinc-500">Location</dt>
          <dd className="font-medium">
            <Link href={`/destinations/${experience.destination.slug}`} className="underline">
              {experience.destination.name}
            </Link>
            , {experience.destination.district}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-zinc-500">Provider</dt>
          <dd className="font-medium">
            {experience.provider.displayName}
            {experience.provider.district ? ` (${experience.provider.district})` : null}
            <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Verified
            </span>
          </dd>
        </div>
      </dl>

      {experience.description ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">About this experience</h2>
          <p className="whitespace-pre-line text-zinc-700 dark:text-zinc-300">
            {experience.description}
          </p>
        </section>
      ) : null}

      <p className="rounded-md bg-zinc-100 p-3 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        Prices are indicative and availability isn&apos;t guaranteed until the provider confirms
        your booking.
      </p>

      <section className="flex flex-col gap-3" aria-labelledby="book-heading">
        <h2 id="book-heading" className="text-lg font-semibold">
          Request to book
        </h2>
        <Suspense fallback={<LoadingBlock label="Loading dates…" />}>
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
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<LoadingBlock label="Loading experience…" />}>
        <ExperienceDetail {...props} />
      </Suspense>
    </main>
  );
}
