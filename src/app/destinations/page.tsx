import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingBlock, PageShell } from "@/components/page-shell";
import { DestinationCard } from "@/features/discovery/components/destination-card";
import { DestinationFiltersForm } from "@/features/discovery/components/filter-forms";
import { Pagination } from "@/features/discovery/components/pagination";
import { ResultsSummary } from "@/features/discovery/components/results-summary";
import { destinationsHref, parseDestinationSearchParams } from "@/features/discovery/search-params";
import { listPublicDistricts, searchDestinations } from "@/server/catalog/catalog";

export const metadata: Metadata = {
  title: "Destinations · Himverse.AI",
  description: "Explore destinations across Arunachal Pradesh.",
};

async function DestinationResults({ searchParams }: PageProps<"/destinations">) {
  const { filters, ignored } = parseDestinationSearchParams(await searchParams);
  const [results, districts] = await Promise.all([
    searchDestinations(filters),
    listPublicDistricts(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <DestinationFiltersForm filters={filters} districts={districts} />
      <ResultsSummary
        total={results.total}
        noun={{ one: "destination", many: "destinations" }}
        hasFilters={Boolean(filters.q || filters.district)}
        clearHref="/destinations"
        ignored={ignored}
        outOfRange={results.outOfRange}
        firstPageHref={destinationsHref(filters, { page: 1 })}
      />
      {results.items.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.items.map((destination) => (
            <DestinationCard key={destination.id} destination={destination} />
          ))}
        </ul>
      ) : null}
      <Pagination
        page={results.page}
        pageCount={results.pageCount}
        hrefFor={(page) => destinationsHref(filters, { page })}
      />
    </div>
  );
}

export default function DestinationsPage(props: PageProps<"/destinations">) {
  return (
    <PageShell title="Destinations in Arunachal Pradesh">
      <Suspense fallback={<LoadingBlock label="Loading destinations…" />}>
        <DestinationResults {...props} />
      </Suspense>
    </PageShell>
  );
}
