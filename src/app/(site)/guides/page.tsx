import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingBlock, PageShell } from "@/components/page-shell";
import { ListingResults } from "@/features/discovery/components/listing-results";

export const metadata: Metadata = {
  title: "Guides · Himverse.AI",
  description:
    "Local guides by the day, with the languages they speak. Guides confirm availability and the final price.",
};

export default function GuidesPage(props: PageProps<"/guides">) {
  return (
    <PageShell
      title="Guides in Arunachal Pradesh"
      description="Local guides by the day, with the languages they speak. Guides confirm availability and the final price."
    >
      <Suspense fallback={<LoadingBlock label="Loading…" variant="cards" />}>
        <ListingResults searchParams={props.searchParams} listingType="guide" />
      </Suspense>
    </PageShell>
  );
}
