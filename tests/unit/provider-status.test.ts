import { describe, expect, it } from "vitest";

import {
  canPublishExperience,
  canSubmitForReview,
  isValidReview,
  type ProviderStatus,
  reviewDecisionsFor,
  reviewRequiresNote,
} from "@/server/providers/status";

const ALL: ProviderStatus[] = ["draft", "pending_review", "verified", "rejected", "suspended"];

describe("provider lifecycle (mirror of the SQL functions)", () => {
  it("allows submission only from draft or rejected", () => {
    expect(ALL.filter(canSubmitForReview)).toEqual(["draft", "rejected"]);
  });

  it("offers exactly the admin transitions allowed by review_provider()", () => {
    expect(reviewDecisionsFor("pending_review")).toEqual(["verified", "rejected"]);
    expect(reviewDecisionsFor("verified")).toEqual(["suspended"]);
    expect(reviewDecisionsFor("suspended")).toEqual(["verified"]);
    expect(reviewDecisionsFor("draft")).toEqual([]);
    expect(reviewDecisionsFor("rejected")).toEqual([]);
  });

  it("rejects invalid transitions", () => {
    expect(isValidReview("verified", "rejected")).toBe(false);
    expect(isValidReview("draft", "verified")).toBe(false);
    expect(isValidReview("suspended", "suspended")).toBe(false);
    expect(isValidReview("pending_review", "verified")).toBe(true);
  });

  it("requires a note for rejection and suspension only", () => {
    expect(reviewRequiresNote("rejected")).toBe(true);
    expect(reviewRequiresNote("suspended")).toBe(true);
    expect(reviewRequiresNote("verified")).toBe(false);
  });
});

describe("canPublishExperience", () => {
  it("requires a verified provider and a published destination", () => {
    expect(canPublishExperience("verified", true)).toBe(true);
    expect(canPublishExperience("verified", false)).toBe(false);
    for (const status of ALL.filter((s) => s !== "verified")) {
      expect(canPublishExperience(status, true)).toBe(false);
    }
  });
});
