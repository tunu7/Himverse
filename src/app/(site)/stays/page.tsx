import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingBlock, PageShell } from "@/components/page-shell";
import { ListingResults } from "@/features/discovery/components/listing-results";

export const metadata: Metadata = {
  title: "Stays · Himverse.AI",
  description:
    "Homestays and rooms from verified local hosts. Book by the night; hosts confirm availability and the final price.",
};

export default function StaysPage(props: PageProps<"/stays">) {
  return (
    <PageShell
      title="Stays in Arunachal Pradesh"
      description="Homestays and rooms from verified local hosts. Book by the night; hosts confirm availability and the final price."
    >
      <Suspense fallback={<LoadingBlock label="Loading…" variant="cards" />}>
        <ListingResults searchParams={props.searchParams} listingType="stay" />
      </Suspense>
    </PageShell>
  );
}
