import Link from "next/link";

export default function DestinationNotFound() {
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">Destination not found</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        This destination doesn&apos;t exist or isn&apos;t published yet.
      </p>
      <Link href="/destinations" className="underline">
        Browse all destinations
      </Link>
    </section>
  );
}
