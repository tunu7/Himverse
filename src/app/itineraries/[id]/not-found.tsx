import Link from "next/link";

export default function ItineraryNotFound() {
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">Itinerary not found</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        This itinerary doesn&apos;t exist or isn&apos;t yours.
      </p>
      <Link href="/itineraries" className="underline">
        Your trips
      </Link>
    </section>
  );
}
