import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <p className="text-sm font-medium tracking-widest text-emerald-700 uppercase dark:text-emerald-400">
        Arunachal Pradesh · Coming soon
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Himverse.AI
      </h1>
      <p className="max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
        Discover trusted Himalayan experiences and plan personalised itineraries built from verified
        local providers.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/destinations"
          className="rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800"
        >
          Browse destinations
        </Link>
        <Link
          href="/experiences"
          className="rounded-md border border-zinc-300 px-4 py-2 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Find experiences
        </Link>
      </div>
    </main>
  );
}
