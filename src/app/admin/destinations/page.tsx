import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { cardClass } from "@/components/form-feedback";
import { LoadingBlock, PageShell } from "@/components/page-shell";
import { EmptyState } from "@/components/ui";
import {
  DeleteDestinationButton,
  DestinationForm,
} from "@/features/admin/components/destination-forms";
import { listAllDestinations } from "@/server/admin/admin";
import { requireAdminForPage } from "@/server/auth/session";

export const metadata: Metadata = { title: "Destinations · Admin", robots: { index: false } };

async function Destinations() {
  await requireAdminForPage("/admin/destinations");
  const destinations = await listAllDestinations();
  return (
    <div className="flex flex-col gap-8">
      <details className={`${cardClass} p-5`}>
        <summary className="cursor-pointer font-semibold text-fg">Add a destination</summary>
        <div className="mt-4">
          <DestinationForm />
        </div>
      </details>

      {destinations.length === 0 ? (
        <EmptyState title="No destinations yet.">
          <p>Add the first destination above.</p>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {destinations.map((d) => (
            <li key={d.id} className={`${cardClass} p-5`}>
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
                  <span className="flex flex-col">
                    <span className="font-semibold text-fg">{d.name}</span>
                    <span className="text-sm text-muted">
                      {d.district} · {d.experienceCount}{" "}
                      {d.experienceCount === 1 ? "experience" : "experiences"}
                    </span>
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      d.isPublished
                        ? "bg-accent-soft text-accent-soft-fg"
                        : "bg-surface-muted text-muted"
                    }`}
                  >
                    {d.isPublished ? "Published" : "Hidden"}
                  </span>
                </summary>
                <div className="mt-5 flex flex-col gap-5 border-t border-line pt-5">
                  {d.isPublished ? (
                    <Link
                      href={`/destinations/${d.slug}`}
                      className="self-start text-sm font-medium text-accent hover:underline"
                    >
                      View public page →
                    </Link>
                  ) : null}
                  <DestinationForm
                    initial={{
                      id: d.id,
                      slug: d.slug,
                      name: d.name,
                      district: d.district,
                      summary: d.summary,
                      description: d.description,
                      isPublished: d.isPublished,
                    }}
                  />
                  {d.experienceCount === 0 ? (
                    <DeleteDestinationButton id={d.id} name={d.name} />
                  ) : (
                    <p className="text-xs text-subtle">
                      Can&apos;t be deleted while experiences use it; unpublish it instead.
                    </p>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminDestinationsPage() {
  return (
    <PageShell
      title="Destinations"
      description="Curate the places travellers can explore. Unpublishing a destination hides it and its experiences from travellers and the AI planner."
    >
      <Suspense fallback={<LoadingBlock label="Loading destinations…" variant="list" />}>
        <Destinations />
      </Suspense>
    </PageShell>
  );
}
