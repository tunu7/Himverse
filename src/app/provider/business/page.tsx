import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Panel } from "@/components/dashboard";
import { LoadingBlock, PageShell } from "@/components/page-shell";
import {
  BusinessDetailsForm,
  BusinessProfileForm,
} from "@/features/providers/components/partner-forms";
import { SubmitForReviewForm } from "@/features/providers/components/provider-forms";
import { requireAccountForPage } from "@/server/auth/session";
import { getMyBusiness } from "@/server/providers/partner";
import { canSubmitForReview, PROVIDER_STATUS_LABELS } from "@/server/providers/status";

async function Business() {
  await requireAccountForPage("/provider/business", ["partner"]);
  const business = await getMyBusiness();
  if (!business) redirect("/provider");
  // Mirrors the database rules (ADR-0002): the public profile is frozen while
  // under review or suspended; reviewed identity only changes in draft/rejected.
  const profileLocked = business.status === "pending_review" || business.status === "suspended";
  const detailsLocked = !canSubmitForReview(business.status);

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Application">
        <p data-testid="provider-status" className="text-sm">
          Status: <span className="font-medium">{PROVIDER_STATUS_LABELS[business.status]}</span>
          {business.verifiedAt && business.status === "verified"
            ? ` since ${new Date(business.verifiedAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}`
            : ""}
        </p>
        {business.latestReviewNote ? (
          <p className="text-sm text-warning-soft-fg">Reviewer note: {business.latestReviewNote}</p>
        ) : null}
        {canSubmitForReview(business.status) ? (
          <SubmitForReviewForm providerId={business.id} />
        ) : null}
      </Panel>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Public profile">
          {profileLocked ? (
            <p className="text-sm text-muted">
              Your profile is locked while it&apos;s under review or suspended.
            </p>
          ) : null}
          <BusinessProfileForm
            providerId={business.id}
            displayName={business.displayName}
            description={business.description}
            district={business.district}
            locked={profileLocked}
          />
        </Panel>
        <Panel title="Legal and contact details">
          <p className="text-sm text-muted">
            {detailsLocked
              ? "Locked after submission so the details we review can't change. Contact Himverse to update them."
              : "Only Himverse sees these. They're checked when you submit for review."}
          </p>
          <BusinessDetailsForm
            providerId={business.id}
            legalName={business.legalName}
            contactEmail={business.contactEmail}
            contactPhone={business.contactPhone}
            locked={detailsLocked}
          />
        </Panel>
      </div>
    </div>
  );
}

export default function BusinessPage() {
  return (
    <PageShell
      title="Business profile"
      description="What travellers see, and what Himverse reviews."
    >
      <Suspense fallback={<LoadingBlock label="Loading your business…" variant="form" />}>
        <Business />
      </Suspense>
    </PageShell>
  );
}
