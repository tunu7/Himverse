import Link from "next/link";

import { buttonClass, cardClass, inputClass } from "@/components/form-feedback";

const HIGHLIGHTS = [
  {
    title: "Verified local providers",
    body: "Every experience comes from a provider our team has reviewed.",
  },
  {
    title: "Trip plans in minutes",
    body: "Describe your trip and get a day-by-day plan built only from listed experiences.",
  },
  {
    title: "Request to book",
    body: "Pick a date and send a request. The provider confirms the final price.",
  },
] as const;

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="border-b border-line bg-gradient-to-b from-accent-soft/60 to-canvas">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-16 sm:px-6 sm:py-24">
          <p className="text-sm font-medium tracking-widest text-accent uppercase">
            Arunachal Pradesh · Coming soon
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-fg sm:text-5xl">Himverse.AI</h1>
          <p className="max-w-2xl text-lg leading-8 text-muted">
            Discover trusted Himalayan experiences and plan personalised itineraries built from
            verified local providers.
          </p>
          <form
            action="/experiences"
            method="get"
            role="search"
            aria-label="Search experiences"
            className="flex w-full max-w-xl flex-col gap-2 sm:flex-row"
          >
            <label htmlFor="home-search" className="sr-only">
              Search experiences
            </label>
            <input
              id="home-search"
              type="search"
              name="q"
              maxLength={100}
              placeholder="Try monastery, rafting or birding"
              className={inputClass}
            />
            <button type="submit" className={buttonClass}>
              Search
            </button>
          </form>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link href="/destinations" className="font-medium text-accent hover:underline">
              Browse destinations →
            </Link>
            <Link href="/experiences" className="font-medium text-accent hover:underline">
              Find experiences →
            </Link>
          </div>
        </div>
      </section>

      <section
        aria-label="How Himverse works"
        className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6"
      >
        <ul className="grid gap-4 sm:grid-cols-3">
          {HIGHLIGHTS.map((item) => (
            <li key={item.title} className={`${cardClass} flex flex-col gap-2 p-5`}>
              <p className="font-semibold text-fg">{item.title}</p>
              <p className="text-sm leading-6 text-muted">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
