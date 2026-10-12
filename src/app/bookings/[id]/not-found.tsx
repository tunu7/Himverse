import Link from "next/link";

export default function BookingNotFound() {
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">Booking not found</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        This booking doesn&apos;t exist or isn&apos;t yours.
      </p>
      <Link href="/bookings" className="underline">
        Your bookings
      </Link>
    </section>
  );
}
