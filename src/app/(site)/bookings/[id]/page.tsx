import { Suspense } from "react";

import { LoadingBlock, PageMain } from "@/components/page-shell";
import { BookingDetail } from "@/features/bookings/components/booking-detail";
import { requireAccountForPage } from "@/server/auth/session";

async function TravellerBooking({ params }: PageProps<"/bookings/[id]">) {
  const { id } = await params;
  await requireAccountForPage(`/bookings/${id}`, ["traveller"]);
  return <BookingDetail id={id} viewer="traveller" />;
}

export default function BookingPage(props: PageProps<"/bookings/[id]">) {
  return (
    <PageMain width="narrow">
      <Suspense fallback={<LoadingBlock label="Loading booking…" variant="detail" />}>
        <TravellerBooking {...props} />
      </Suspense>
    </PageMain>
  );
}
