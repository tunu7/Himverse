import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LoadingBlock, PageShell } from "@/components/page-shell";
import { ReviewProviderForm } from "@/features/admin/components/review-form";
import { isCurrentUserAdmin, requireUserForPage } from "@/server/auth/session";
import { listProvidersForReview } from "@/server/providers/providers";
import { PROVIDER_STATUS_LABELS, reviewDecisionsFor } from "@/server/providers/status";

async function ReviewQueue() {
  await requireUserForPage("/admin/providers");
  if (!(await isCurrentUserAdmin())) {
    // Don't reveal that an admin area exists.
    notFound();
  }
  const providers = await listProvidersForReview();
  if (providers.length === 0) {
    return <p className="text-muted">No submitted providers yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-4">
      {providers.map((p) => (
        <li
          key={p.id}
          className="flex flex-col gap-3 rounded-xl border border-line bg-surface shadow-xs p-5"
        >
          <div>
            <p className="font-semibold">
              {p.displayName} <span className="font-normal text-subtle">/{p.slug}</span>
            </p>
            <p className="text-sm text-muted">
              {PROVIDER_STATUS_LABELS[p.status]}
              {p.district ? ` · ${p.district}` : null}
            </p>
            <p className="text-sm text-muted">
              {p.legalName ?? "—"} · {p.contactEmail ?? "—"}
            </p>
          </div>
          <ReviewProviderForm providerId={p.id} decisions={reviewDecisionsFor(p.status)} />
        </li>
      ))}
    </ul>
  );
}

export default function AdminProvidersPage() {
  return (
    <PageShell title="Provider review">
      <Suspense fallback={<LoadingBlock label="Loading providers…" variant="list" />}>
        <ReviewQueue />
      </Suspense>
    </PageShell>
  );
}
