import Link from "next/link";
import { Suspense } from "react";

import { buttonClass, inputClass, secondaryButtonClass } from "@/components/form-feedback";
import { Skeleton } from "@/components/ui";
import { DestinationCard } from "@/features/discovery/components/destination-card";
import { ExperienceCard } from "@/features/discovery/components/experience-card";
import { searchDestinations, searchExperiences } from "@/server/catalog/catalog";

const STEPS = [
  {
    title: "Tell us about your trip",
    body: "Dates, who's coming, your budget and what you love doing.",
  },
  {
    title: "Get a day-by-day plan",
    body: "Our AI builds it only from real experiences listed by verified local providers.",
  },
  {
    title: "Refine and request",
    body: "Adjust the plan in plain words, then request the experiences you want. Providers confirm the price.",
  },
] as const;

function SectionHeading({
  title,
  subtitle,
  href,
  linkLabel,
}: {
  title: string;
  subtitle: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{title}</h2>
        <p className="text-muted">{subtitle}</p>
      </div>
      <Link href={href} className="text-sm font-semibold text-accent hover:underline">
        {linkLabel} →
      </Link>
    </div>
  );
}

function CardRowSkeleton({ count }: { count: number }) {
  return (
    <div role="status" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-line">
          <Skeleton className="h-28 w-full rounded-none" />
          <div className="flex flex-col gap-3 p-5">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

async function FeaturedExperiences() {
  const { items } = await searchExperiences({ sort: "newest", page: 1 });
  if (items.length === 0) {
    return <p className="text-muted">New experiences are being added. Check back soon.</p>;
  }
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.slice(0, 6).map((experience) => (
        <ExperienceCard key={experience.id} experience={experience} />
      ))}
    </ul>
  );
}

async function FeaturedDestinations() {
  const { items } = await searchDestinations({ page: 1 });
  if (items.length === 0) return null;
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {items.slice(0, 4).map((destination) => (
        <DestinationCard key={destination.id} destination={destination} />
      ))}
    </ul>
  );
}

function MountainArt() {
  return (
    <svg
      viewBox="0 0 800 240"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full sm:h-56"
    >
      <path
        d="M0 240 L120 110 L210 180 L330 60 L450 170 L560 90 L680 160 L800 80 L800 240 Z"
        className="fill-accent/10"
      />
      <path
        d="M0 240 L90 170 L190 210 L300 130 L420 210 L520 150 L640 200 L740 140 L800 170 L800 240 Z"
        className="fill-accent/15"
      />
      <path d="M330 60 L360 88 L345 86 L330 100 L318 84 L305 86 Z" className="fill-canvas/80" />
      <path d="M560 90 L585 112 L572 110 L560 122 L550 108 L538 110 Z" className="fill-canvas/80" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="relative overflow-hidden border-b border-line bg-gradient-to-b from-accent-soft via-canvas to-canvas">
        <div className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-accent/10 blur-3xl" />
        <MountainArt />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-7 px-4 pt-16 pb-28 sm:px-6 sm:pt-24 sm:pb-40">
          <p className="self-start rounded-full border border-accent/25 bg-surface/70 px-3 py-1 text-xs font-semibold tracking-wide text-accent backdrop-blur">
            Himverse.AI · Now exploring Arunachal Pradesh
          </p>
          <h1 className="max-w-3xl text-4xl leading-[1.1] font-semibold tracking-tight text-fg sm:text-6xl">
            Plan your Himalayan journey with trusted local experiences
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-muted">
            Discover monasteries, valleys, rivers and forests, then let AI turn them into a
            day-by-day plan. Every experience comes from a verified local provider.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/itineraries/new" className={`${buttonClass} px-6 py-3 text-base`}>
              Plan my trip with AI
            </Link>
            <Link href="/experiences" className={`${secondaryButtonClass} px-6 py-3 text-base`}>
              Browse experiences
            </Link>
          </div>
          <form
            action="/experiences"
            method="get"
            role="search"
            aria-label="Search experiences"
            className="flex w-full max-w-xl items-center gap-2 rounded-full border border-line bg-surface/80 p-1.5 pl-4 shadow-sm backdrop-blur"
          >
            <label htmlFor="home-search" className="sr-only">
              Search experiences
            </label>
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="size-5 shrink-0 text-subtle"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              id="home-search"
              type="search"
              name="q"
              maxLength={100}
              placeholder="Monastery, rafting, birding…"
              className={`${inputClass} border-0 bg-transparent px-1 shadow-none focus:ring-0`}
            />
            <button type="submit" className={`${buttonClass} shrink-0`}>
              Search
            </button>
          </form>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6">
        <SectionHeading
          title="Experiences to start with"
          subtitle="The latest additions to the catalogue."
          href="/experiences"
          linkLabel="See all experiences"
        />
        <Suspense fallback={<CardRowSkeleton count={3} />}>
          <FeaturedExperiences />
        </Suspense>
      </section>

      <section className="border-y border-line bg-surface-muted">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
              How it works
            </h2>
            <p className="text-muted">From idea to itinerary in three steps.</p>
          </div>
          <ol className="grid gap-5 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 shadow-xs"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-white dark:text-zinc-950">
                  {i + 1}
                </span>
                <p className="text-lg font-semibold text-fg">{step.title}</p>
                <p className="text-sm leading-6 text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6">
        <SectionHeading
          title="Where to go"
          subtitle="Valleys, high passes and rainforest across the state."
          href="/destinations"
          linkLabel="All destinations"
        />
        <Suspense fallback={<CardRowSkeleton count={4} />}>
          <FeaturedDestinations />
        </Suspense>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-700 to-teal-800 px-6 py-12 text-white shadow-lg sm:px-12">
          <div className="pointer-events-none absolute -right-10 -bottom-16 size-72 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-col gap-4 sm:max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Not sure where to begin?
            </h2>
            <p className="text-emerald-50/90">
              Tell us your dates and interests. In about a minute you&apos;ll have a day-by-day plan
              you can refine and save to your trips.
            </p>
            <Link
              href="/itineraries/new"
              className="inline-flex items-center justify-center self-start rounded-full bg-white px-6 py-3 font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-50"
            >
              Start planning — it&apos;s free
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
