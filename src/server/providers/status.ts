/**
 * Provider lifecycle rules, mirrored from the database functions in
 * supabase/migrations/20261012131030_providers.sql (ADR-0002). The database is
 * authoritative; this module lets the UI offer only valid actions and produce
 * clear errors. Keep both in sync — pgTAP and unit tests cover each side.
 */
import type { Database } from "@/types/database";

export type ProviderStatus = Database["public"]["Enums"]["provider_status"];
export type ReviewDecision = Extract<ProviderStatus, "verified" | "rejected" | "suspended">;

const REVIEW_TRANSITIONS: Readonly<Record<ProviderStatus, readonly ReviewDecision[]>> = {
  draft: [],
  pending_review: ["verified", "rejected"],
  verified: ["suspended"],
  rejected: [],
  suspended: ["verified"],
};

/** Owners may submit a draft, or resubmit after rejection. */
export function canSubmitForReview(status: ProviderStatus): boolean {
  return status === "draft" || status === "rejected";
}

/** Decisions an admin may take for a provider in `status`. */
export function reviewDecisionsFor(status: ProviderStatus): readonly ReviewDecision[] {
  return REVIEW_TRANSITIONS[status];
}

export function isValidReview(from: ProviderStatus, decision: ReviewDecision): boolean {
  return REVIEW_TRANSITIONS[from].includes(decision);
}

/** Rejections and suspensions must explain why. */
export function reviewRequiresNote(decision: ReviewDecision): boolean {
  return decision === "rejected" || decision === "suspended";
}

/**
 * Whether an experience may be set to `published`: the provider must be
 * verified and the destination published (same rule as the RLS `with check`).
 */
export function canPublishExperience(
  providerStatus: ProviderStatus,
  destinationPublished: boolean,
): boolean {
  return providerStatus === "verified" && destinationPublished;
}

export const PROVIDER_STATUS_LABELS: Readonly<Record<ProviderStatus, string>> = {
  draft: "Draft — not yet submitted",
  pending_review: "Pending review",
  verified: "Verified",
  rejected: "Changes requested",
  suspended: "Suspended",
};
