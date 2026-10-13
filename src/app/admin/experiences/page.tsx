import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { cardClass, inputClass, secondaryButtonClass } from "@/components/form-feedback";
import { LoadingBlock, PageShell } from "@/components/page-shell";
import { EmptyState } from "@/components/ui";
import { ModerationButtons } from "@/features/admin/components/moderation-buttons";
import { type AdminExperience, listExperiencesForModeration } from "@/server/admin/admin";
import { requireAdminForPage } from "@/server/auth/session";

export const metadata: Metadata = { title: "Experiences · Admin", robots: { index: false } };

const FILTERS = [
  { key: "", label: "All" },
  { key: "published", label: "Published" },
  { key: "draft", label: "Draft / unpublished" },
  { key: "archived", label: "Archived" },
] as const;
type StatusFilter = Exclude<(typeof FILTERS)[number]["key"], "">;

const STATUS_TONE: Record<AdminExperience["status"], string> = {
  published: "bg-accent-soft text-accent-soft-fg",
  draft: "bg-surface-muted text-muted",
  archived: "bg-danger-soft text-danger-soft-fg",
};
const STATUS_LABEL: Record<AdminExperience["status"], string> = {
  published: "Published",
  draft: "Draft",
  archived: "Archived",
};

function actionsFor(e: AdminExperience) {
  if (e.status === "published") return ["unpublish", "archive"] as const;
  return e.status === "draft" ? (["publish", "archive"] as const) : (["publish"] as const);
}

async function Experiences({ searchParams }: PageProps<"/admin/experiences">) {
  await requireAdminForPage("/admin/experiences");
  const params = await searchParams;
  const status = FILTERS.some((f) => f.key && f.key === params.status)
    ? (params.status as StatusFilter)
    : undefined;
  const q =
    typeof params.q === "string" && params.q.trim() ? params.q.trim().slice(0, 100) : undefined;
  const experiences = await listExperiencesForModeration({ status, q });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Filter experiences" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = (status ?? "") === f.key;
            const href = f.key ? `/admin/experiences?status=${f.key}` : "/admin/experiences";
            return (
              <Link
                key={f.key || "all"}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                  active
                    ? "border-accent bg-accent-soft text-accent-soft-fg"
                    : "border-line-strong text-fg-soft hover:bg-surface-muted"
                }`}
              >
                {f.label}
              </Link>
            );
          })}
        </nav>
        <form action="/admin/experiences" method="get" role="search" className="flex gap-2">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <label htmlFor="admin-exp-q" className="sr-only">
            Search experiences
          </label>
          <input
            id="admin-exp-q"
            type="search"
            name="q"
            defaultValue={q ?? ""}
            maxLength={100}
            placeholder="Search titles…"
            className={`${inputClass} sm:w-56`}
          />
          <button type="submit" className={secondaryButtonClass}>
            Search
          </button>
        </form>
      </div>

      {experiences.length === 0 ? (
        <EmptyState title="No experiences match.">
          <p>Try another filter or search.</p>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {experiences.map((e) => (
            <li
              key={e.id}
              className={`${cardClass} flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between`}
            >
              <div className="flex flex-col gap-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-fg">{e.title}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[e.status]}`}
                  >
                    {STATUS_LABEL[e.status]}
                  </span>
                  {e.moderationLocked ? (
                    <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning-soft-fg">
                      Locked by moderation
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-muted">
                  {e.providerName}
                  {e.providerStatus !== "verified" ? " (provider not verified)" : ""} ·{" "}
                  {e.destinationName}
                </p>
                {e.status === "published" ? (
                  <Link
                    href={`/experiences/${e.slug}`}
                    className="self-start text-sm font-medium text-accent hover:underline"
                  >
                    View public page →
                  </Link>
                ) : null}
              </div>
              <ModerationButtons experienceId={e.id} actions={actionsFor(e)} />
            </li>
          ))}
        </ul>
      )}
      {experiences.length === 200 ? (
        <p className="text-sm text-subtle">Showing the 200 most recently updated. Use search.</p>
      ) : null}
    </div>
  );
}

export default function AdminExperiencesPage(props: PageProps<"/admin/experiences">) {
  return (
    <PageShell
      title="Experience moderation"
      description="Unpublishing or archiving an experience locks it: the provider can't republish it until an admin publishes it again."
    >
      <Suspense fallback={<LoadingBlock label="Loading experiences…" variant="list" />}>
        <Experiences {...props} />
      </Suspense>
    </PageShell>
  );
}
