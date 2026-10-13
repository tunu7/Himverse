import Link from "next/link";

export default function ItineraryNotFound() {
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">Itinerary not found</h1>
      <p className="text-muted">This itinerary doesn&apos;t exist or isn&apos;t yours.</p>
      <Link
        href="/itineraries"
        className="font-medium text-accent underline-offset-4 hover:underline"
      >
        Your trips
      </Link>
    </section>
  );
}
