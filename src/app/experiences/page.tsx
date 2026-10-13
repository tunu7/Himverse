import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { buttonClass } from "@/components/form-feedback";
import { LoadingBlock, PageShell } from "@/components/page-shell";
import { ExperienceCard } from "@/features/discovery/components/experience-card";
import { ExperienceFiltersForm } from "@/features/discovery/components/filter-forms";
import { Pagination } from "@/features/discovery/components/pagination";
import { ResultsSummary } from "@/features/discovery/components/results-summary";
import { experiencesHref, parseExperienceSearchParams } from "@/features/discovery/search-params";
import { listPublicDistricts, searchExperiences } from "@/server/catalog/catalog";

export const metadata: Metadata = {
  title: "Experiences · Himverse.AI",
  description: "Search experiences from verified local providers in Arunachal Pradesh.",
};

async function ExperienceResults({ searchParams }: PageProps<"/experiences">) {
  const { filters, ignored } = parseExperienceSearchParams(await searchParams);
  const [results, districts] = await Promise.all([
    searchExperiences(filters),
    listPublicDistricts(),
  ]);
  const hasFilters = Boolean(
    filters.q || filters.district || filters.category || filters.budget || filters.duration,
  );

  return (
    <div className="flex flex-col gap-6">
      <ExperienceFiltersForm filters={filters} districts={districts} />
      <ResultsSummary
        total={results.total}
        noun={{ one: "experience", many: "experiences" }}
        hasFilters={hasFilters}
        clearHref="/experiences"
        ignored={ignored}
        outOfRange={results.outOfRange}
        firstPageHref={experiencesHref(filters, { page: 1 })}
      />
      {results.items.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.items.map((experience) => (
            <ExperienceCard key={experience.id} experience={experience} />
          ))}
        </ul>
      ) : null}
      <Pagination
        page={results.page}
        pageCount={results.pageCount}
        hrefFor={(page) => experiencesHref(filters, { page })}
      />
      <aside className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface-muted p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-fg">Rather not plan it all yourself?</p>
          <p className="text-sm text-muted">
            Tell our AI planner your dates and interests and get a day-by-day plan in about a
            minute.
          </p>
        </div>
        <Link href="/itineraries/new" className={`${buttonClass} shrink-0`}>
          Plan my trip with AI
        </Link>
      </aside>
    </div>
  );
}

export default function ExperiencesPage(props: PageProps<"/experiences">) {
  return (
    <PageShell
      title="Experiences in Arunachal Pradesh"
      description="From verified local providers. Prices are indicative; nothing here is a booking or an availability guarantee."
    >
      <Suspense fallback={<LoadingBlock label="Loading experiences…" variant="cards" />}>
        <ExperienceResults {...props} />
      </Suspense>
    </PageShell>
  );
}
