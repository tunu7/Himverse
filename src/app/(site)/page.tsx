import Link from "next/link";
import { connection } from "next/server";
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

const PROMISES = [
  { title: "Verified providers", body: "Every partner is reviewed by our team." },
  { title: "Grounded AI", body: "Plans use only experiences in our catalogue." },
  { title: "No surprises", body: "Providers confirm dates and the final price." },
] as const;

function SectionHeading({
  eyebrow,
  title,
  subtitle,
  href,
  linkLabel,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="reveal flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-[0.18em] text-accent uppercase">{eyebrow}</p>
        <h2 className="text-3xl font-semibold tracking-[-0.03em] text-fg sm:text-4xl">{title}</h2>
        <p className="text-muted">{subtitle}</p>
      </div>
      <Link
        href={href}
        className="group inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-medium text-fg transition duration-200 hover:border-line-strong hover:shadow-sm"
      >
        {linkLabel}
        <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </Link>
    </div>
  );
}

function CardRowSkeleton({ count }: { count: number }) {
  return (
    <div role="status" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-3xl border border-line">
          <Skeleton className="h-36 w-full rounded-none" />
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

// connection(): render per request (inside Suspense) so listings are always
// current and the build never queries the database.
async function FeaturedExperiences() {
  await connection();
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
  await connection();
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

/** Layered ridges that drift slowly behind the hero. Decorative. */
function MountainArt() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-48 overflow-hidden sm:h-64"
    >
      <svg
        viewBox="0 0 1600 240"
        preserveAspectRatio="none"
        className="absolute bottom-0 left-0 h-full w-[115%] animate-drift-slow text-accent"
      >
        <path
          d="M0 240 L140 120 L240 170 L380 60 L520 160 L640 90 L780 150 L900 70 L1040 150 L1180 80 L1320 160 L1460 90 L1600 140 L1600 240 Z"
          fill="currentColor"
          opacity="0.07"
        />
      </svg>
      <svg
        viewBox="0 0 1600 240"
        preserveAspectRatio="none"
        className="absolute bottom-0 left-0 h-3/4 w-[115%] animate-drift text-accent"
      >
        <path
          d="M0 240 L100 170 L220 200 L340 130 L480 205 L600 150 L740 195 L860 140 L1000 200 L1120 150 L1260 190 L1400 140 L1600 185 L1600 240 Z"
          fill="currentColor"
          opacity="0.1"
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-canvas to-transparent" />
    </div>
  );
}

const rise = (delay: number) => ({ animationDelay: `${delay}ms` });

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="relative isolate overflow-hidden">
        <div
          aria-hidden="true"
          className="bg-dots pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[32rem] w-[56rem] -translate-x-1/2 rounded-full bg-accent/15 blur-3xl"
        />
        <MountainArt />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-7 px-4 pt-16 pb-36 text-center sm:px-6 sm:pt-28 sm:pb-52">
          <p
            style={rise(0)}
            className="inline-flex animate-rise items-center gap-2 rounded-full border border-line bg-surface/70 px-3.5 py-1.5 text-xs font-medium text-fg-soft backdrop-blur"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-accent" />
            </span>
            Now exploring Arunachal Pradesh
          </p>
          <h1
            style={rise(80)}
            className="max-w-4xl animate-rise text-[2.75rem] leading-[1.02] font-semibold tracking-[-0.045em] text-fg sm:text-7xl"
          >
            Plan your Himalayan journey with{" "}
            <span className="font-display font-normal tracking-[-0.02em] text-accent italic">
              trusted local
            </span>{" "}
            experiences
          </h1>
          <p style={rise(160)} className="max-w-xl animate-rise text-lg leading-8 text-muted">
            Discover monasteries, valleys, rivers and forests, then let AI turn them into a
            day-by-day plan. Every experience comes from a verified local provider.
          </p>
          <div style={rise(240)} className="flex animate-rise flex-wrap justify-center gap-3">
            <Link href="/itineraries/new" className={`${buttonClass} group px-6 py-3 text-base`}>
              Plan my trip with AI
              <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
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
            style={rise(320)}
            className="flex w-full max-w-xl animate-rise items-center gap-2 rounded-full border border-line bg-surface/80 p-1.5 pl-5 shadow-xl shadow-black/[0.04] backdrop-blur-xl transition focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/10"
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
              className={`${inputClass} border-0 bg-transparent px-1 hover:border-0 focus:ring-0`}
            />
            <button type="submit" className={`${buttonClass} shrink-0`}>
              Search
            </button>
          </form>
        </div>
      </section>

      <section aria-label="Why Himverse.AI" className="border-y border-line bg-surface/60">
        <ul className="mx-auto grid w-full max-w-6xl divide-y divide-line px-4 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-6">
          {PROMISES.map((promise) => (
            <li
              key={promise.title}
              className="reveal flex items-start gap-3 py-6 sm:px-6 sm:first:pl-0"
            >
              <span
                aria-hidden="true"
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs text-accent-soft-fg"
              >
                ✓
              </span>
              <div>
                <p className="font-medium text-fg">{promise.title}</p>
                <p className="text-sm text-muted">{promise.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeading
          eyebrow="Experiences"
          title="Experiences to start with"
          subtitle="The latest additions to the catalogue."
          href="/experiences"
          linkLabel="See all experiences"
        />
        <Suspense fallback={<CardRowSkeleton count={3} />}>
          <FeaturedExperiences />
        </Suspense>
      </section>

      <section className="bg-surface-muted/70">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-20 sm:px-6 sm:py-28">
          <div className="reveal flex flex-col gap-2">
            <p className="text-xs font-medium tracking-[0.18em] text-accent uppercase">
              How it works
            </p>
            <h2 className="text-3xl font-semibold tracking-[-0.03em] text-fg sm:text-4xl">
              From idea to itinerary in{" "}
              <span className="font-display font-normal italic">three steps</span>
            </h2>
          </div>
          <ol className="grid gap-8 sm:grid-cols-3 sm:gap-6">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="reveal flex flex-col gap-3 border-t border-line-strong pt-6"
              >
                <span className="font-display text-5xl leading-none text-accent">0{i + 1}</span>
                <p className="text-lg font-semibold tracking-tight text-fg">{step.title}</p>
                <p className="text-sm leading-6 text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeading
          eyebrow="Destinations"
          title="Where to go"
          subtitle="Valleys, high passes and rainforest across the state."
          href="/destinations"
          linkLabel="All destinations"
        />
        <Suspense fallback={<CardRowSkeleton count={4} />}>
          <FeaturedDestinations />
        </Suspense>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        <div className="reveal relative isolate overflow-hidden rounded-[2rem] bg-ink ring-1 ring-white/5 px-6 py-14 text-white sm:px-14 sm:py-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 -right-20 -z-10 size-96 rounded-full bg-emerald-500/25 blur-3xl"
          />
          <svg
            viewBox="0 0 800 200"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-32 w-full animate-drift text-emerald-300 sm:h-44"
          >
            <path
              d="M0 200 L120 100 L210 150 L330 50 L450 140 L560 80 L680 140 L800 70 L800 200 Z"
              fill="currentColor"
              opacity="0.08"
            />
          </svg>
          <div className="flex flex-col gap-5 sm:max-w-xl">
            <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-5xl">
              Not sure where to{" "}
              <span className="font-display font-normal text-emerald-300 italic">begin?</span>
            </h2>
            <p className="text-lg leading-8 text-white/70">
              Tell us your dates and interests. In about a minute you&apos;ll have a day-by-day plan
              you can refine and save to your trips.
            </p>
            <Link
              href="/itineraries/new"
              className="group inline-flex items-center justify-center gap-2 self-start rounded-full bg-white px-6 py-3 font-medium text-ink transition duration-200 hover:-translate-y-px hover:bg-emerald-300"
            >
              Start planning — it&apos;s free
              <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
