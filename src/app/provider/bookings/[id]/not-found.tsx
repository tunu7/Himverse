import Link from "next/link";

export default function BookingNotFound() {
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">Booking not found</h1>
      <p className="text-muted">This booking doesn&apos;t exist or isn&apos;t yours.</p>
      <Link
        href="/provider/bookings"
        className="font-medium text-accent underline-offset-4 hover:underline"
      >
        Booking requests
      </Link>
    </section>
  );
}
