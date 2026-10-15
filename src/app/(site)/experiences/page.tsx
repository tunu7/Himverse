import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingBlock, PageShell } from "@/components/page-shell";
import { ListingResults } from "@/features/discovery/components/listing-results";

export const metadata: Metadata = {
  title: "Experiences · Himverse.AI",
  description: "Search experiences from verified local providers in Arunachal Pradesh.",
};

export default function ExperiencesPage(props: PageProps<"/experiences">) {
  return (
    <PageShell
      title="Experiences in Arunachal Pradesh"
      description="From verified local providers. Prices are indicative; nothing here is a booking or an availability guarantee."
    >
      <Suspense fallback={<LoadingBlock label="Loading experiences…" variant="cards" />}>
        <ListingResults searchParams={props.searchParams} listingType="experience" />
      </Suspense>
    </PageShell>
  );
}
