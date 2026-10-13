import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LoadingBlock, PageShell } from "@/components/page-shell";
import { EmptyState } from "@/components/ui";
import { ReviewProviderForm } from "@/features/admin/components/review-form";
import { listProviderStatusEvents } from "@/server/admin/admin";
import { requireAdminForPage } from "@/server/auth/session";
import { listProvidersForReview } from "@/server/providers/providers";
import {
  PROVIDER_STATUS_LABELS,
  type ProviderStatus,
  reviewDecisionsFor,
} from "@/server/providers/status";

export const metadata: Metadata = { title: "Providers · Admin", robots: { index: false } };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending_review", label: "Awaiting review" },
  { key: "verified", label: "Verified" },
  { key: "rejected", label: "Changes requested" },
  { key: "suspended", label: "Suspended" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const STATUS_TONE: Record<ProviderStatus, string> = {
  draft: "bg-surface-muted text-muted",
  pending_review: "bg-warning-soft text-warning-soft-fg",
  verified: "bg-accent-soft text-accent-soft-fg",
  rejected: "bg-danger-soft text-danger-soft-fg",
  suspended: "bg-danger-soft text-danger-soft-fg",
};

function parseFilter(value: string | string[] | undefined): FilterKey {
  return FILTERS.some((f) => f.key === value) ? (value as FilterKey) : "all";
}

async function ReviewQueue({ searchParams }: PageProps<"/admin/providers">) {
  await requireAdminForPage("/admin/providers");
  const filter = parseFilter((await searchParams).status);
  const all = await listProvidersForReview();
  const providers = filter === "all" ? all : all.filter((p) => p.status === filter);
  const events = await listProviderStatusEvents(providers.map((p) => p.id));

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Filter providers" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const n = f.key === "all" ? all.length : all.filter((p) => p.status === f.key).length;
          const active = f.key === filter;
          return (
            <Link
              key={f.key}
              href={f.key === "all" ? "/admin/providers" : `/admin/providers?status=${f.key}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                active
                  ? "border-accent bg-accent-soft text-accent-soft-fg"
                  : "border-line-strong text-fg-soft hover:bg-surface-muted"
              }`}
            >
              {f.label} <span className="text-subtle">({n})</span>
            </Link>
          );
        })}
      </nav>

      {providers.length === 0 ? (
        <EmptyState
          title={filter === "all" ? "No submitted providers yet." : "No providers in this status."}
        >
          <p>Providers appear here once they submit their application for review.</p>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-4">
          {providers.map((p) => {
            const history = events.filter((e) => e.providerId === p.id);
            return (
              <li
                key={p.id}
                className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <p className="font-semibold text-fg">
                      {p.displayName} <span className="font-normal text-subtle">/{p.slug}</span>
                    </p>
                    <p className="text-sm text-muted">
                      {p.legalName ?? "—"} · {p.contactEmail ?? "—"}
                      {p.district ? ` · ${p.district}` : null}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[p.status]}`}
                  >
                    {PROVIDER_STATUS_LABELS[p.status]}
                  </span>
                </div>
                <ReviewProviderForm providerId={p.id} decisions={reviewDecisionsFor(p.status)} />
                {history.length > 0 ? (
                  <details className="text-sm">
                    <summary className="cursor-pointer font-medium text-muted hover:text-fg">
                      Status history ({history.length})
                    </summary>
                    <ol className="mt-3 flex flex-col gap-2 border-l-2 border-line pl-4">
                      {history.map((e) => (
                        <li key={`${e.at}-${e.toStatus}`} className="flex flex-col">
                          <span className="text-fg-soft">
                            {e.fromStatus ? `${PROVIDER_STATUS_LABELS[e.fromStatus]} → ` : ""}
                            {PROVIDER_STATUS_LABELS[e.toStatus]}
                            <span className="text-subtle">
                              {" "}
                              ·{" "}
                              {new Date(e.at).toLocaleString("en-IN", {
                                dateStyle: "medium",
                                timeStyle: "short",
                                timeZone: "Asia/Kolkata",
                              })}
                            </span>
                          </span>
                          {e.note ? <span className="text-muted">“{e.note}”</span> : null}
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function AdminProvidersPage(props: PageProps<"/admin/providers">) {
  return (
    <PageShell
      title="Provider review"
      description="Verify new providers, request changes, or suspend providers. Suspending hides all their experiences."
    >
      <Suspense fallback={<LoadingBlock label="Loading providers…" variant="list" />}>
        <ReviewQueue {...props} />
      </Suspense>
    </PageShell>
  );
}
