import Link from "next/link";

import { buttonClass } from "@/components/form-feedback";
import { LISTING_TYPE_LABELS, type ListingType } from "@/lib/listing-options";
import { listPublicDistricts, searchExperiences } from "@/server/catalog/catalog";

import { experiencesHref, parseExperienceSearchParams } from "../search-params";
import { ExperienceCard } from "./experience-card";
import { ExperienceFiltersForm } from "./filter-forms";
import { Pagination } from "./pagination";
import { ResultsSummary } from "./results-summary";

const NOUNS: Record<ListingType, { one: string; many: string }> = {
  experience: { one: "experience", many: "experiences" },
  stay: { one: "stay", many: "stays" },
  guide: { one: "guide", many: "guides" },
  transport: { one: "transport option", many: "transport options" },
};

/** Search, filters and results for one listing type's browse page. */
export async function ListingResults({
  searchParams,
  listingType,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  listingType: ListingType;
}) {
  const basePath = LISTING_TYPE_LABELS[listingType].path;
  const { filters, ignored } = parseExperienceSearchParams(await searchParams);
  const [results, districts] = await Promise.all([
    searchExperiences(filters, listingType),
    listPublicDistricts(),
  ]);
  const hasFilters = Boolean(
    filters.q || filters.district || filters.category || filters.budget || filters.duration,
  );

  return (
    <div className="flex flex-col gap-6">
      <ExperienceFiltersForm filters={filters} districts={districts} basePath={basePath} />
      <ResultsSummary
        total={results.total}
        noun={NOUNS[listingType]}
        hasFilters={hasFilters}
        clearHref={basePath}
        ignored={ignored}
        outOfRange={results.outOfRange}
        firstPageHref={experiencesHref(filters, { page: 1 }, basePath)}
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
        hrefFor={(page) => experiencesHref(filters, { page }, basePath)}
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
