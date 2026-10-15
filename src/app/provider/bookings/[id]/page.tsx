import { Suspense } from "react";

import { LoadingBlock, PageMain } from "@/components/page-shell";
import { BookingDetail } from "@/features/bookings/components/booking-detail";
import { requireAccountForPage } from "@/server/auth/session";

async function PartnerBooking({ params }: PageProps<"/provider/bookings/[id]">) {
  const { id } = await params;
  await requireAccountForPage(`/provider/bookings/${id}`, ["partner"]);
  return <BookingDetail id={id} viewer="partner" />;
}

export default function PartnerBookingPage(props: PageProps<"/provider/bookings/[id]">) {
  return (
    <PageMain width="narrow">
      <Suspense fallback={<LoadingBlock label="Loading booking…" variant="detail" />}>
        <PartnerBooking {...props} />
      </Suspense>
    </PageMain>
  );
}
