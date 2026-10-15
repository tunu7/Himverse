import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingBlock, PageShell } from "@/components/page-shell";
import { ListingResults } from "@/features/discovery/components/listing-results";

export const metadata: Metadata = {
  title: "Transport · Himverse.AI",
  description:
    "Private vehicles with local drivers, by trip or by day. Drivers confirm availability and the final price.",
};

export default function TransportPage(props: PageProps<"/transport">) {
  return (
    <PageShell
      title="Transport in Arunachal Pradesh"
      description="Private vehicles with local drivers, by trip or by day. Drivers confirm availability and the final price."
    >
      <Suspense fallback={<LoadingBlock label="Loading…" variant="cards" />}>
        <ListingResults searchParams={props.searchParams} listingType="transport" />
      </Suspense>
    </PageShell>
  );
}
