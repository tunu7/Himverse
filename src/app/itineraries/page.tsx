import Link from "next/link";
import { Suspense } from "react";

import { buttonClass } from "@/components/form-feedback";
import { LoadingBlock, PageShell } from "@/components/page-shell";
import { requireUserForPage } from "@/server/auth/session";
import { listMyItineraries } from "@/server/itineraries/repository";

async function ItineraryList() {
  await requireUserForPage("/itineraries");
  const itineraries = await listMyItineraries();
  if (itineraries.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-zinc-600 dark:text-zinc-400">You haven&apos;t planned any trips yet.</p>
        <Link href="/itineraries/new" className={buttonClass}>
          Plan a trip
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Link href="/itineraries/new" className={`${buttonClass} self-start`}>
        Plan another trip
      </Link>
      <ul className="flex flex-col gap-3">
        {itineraries.map((it) => (
          <li key={it.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <Link href={`/itineraries/${it.id}`} className="font-semibold underline">
              {it.title}
            </Link>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {it.versionCount} {it.versionCount === 1 ? "version" : "versions"} · updated{" "}
              {new Date(it.updatedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ItinerariesPage() {
  return (
    <PageShell title="Your trips">
      <Suspense fallback={<LoadingBlock label="Loading your trips…" />}>
        <ItineraryList />
      </Suspense>
    </PageShell>
  );
}
