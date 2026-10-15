import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors";

// Server Actions must (1) reject invalid input before touching the server layer and
// (2) surface the server layer's authorization failures as client-safe results.
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const server = {
  createProviderApplication: vi.fn(),
  submitProviderApplication: vi.fn(),
  createExperience: vi.fn(),
  setExperienceStatus: vi.fn(),
  setExperienceAcceptsBookings: vi.fn(),
  reviewProvider: vi.fn(),
  updateMyDisplayName: vi.fn(),
};
vi.mock("@/server/providers/providers", () => ({
  createProviderApplication: (...a: unknown[]) => server.createProviderApplication(...a),
  submitProviderApplication: (...a: unknown[]) => server.submitProviderApplication(...a),
  createExperience: (...a: unknown[]) => server.createExperience(...a),
  setExperienceStatus: (...a: unknown[]) => server.setExperienceStatus(...a),
  setExperienceAcceptsBookings: (...a: unknown[]) => server.setExperienceAcceptsBookings(...a),
  reviewProvider: (...a: unknown[]) => server.reviewProvider(...a),
}));
// Account-type guard (ADR-0007): allowed by default; tests below refuse it.
const requireAccount = vi.fn<(types: readonly string[]) => Promise<{ id: string }>>(async () => ({
  id: "u1",
}));
vi.mock("@/server/auth/session", () => ({
  requireAccount: (types: readonly string[]) => requireAccount(types),
}));
vi.mock("@/server/profiles/profiles", () => ({
  updateMyDisplayName: (...a: unknown[]) => server.updateMyDisplayName(...a),
}));

const {
  applyAsProvider,
  submitForReview,
  addExperience,
  changeExperienceStatus,
  changeExperienceAcceptsBookings,
} = await import("@/features/providers/actions");
const { reviewProviderAction } = await import("@/features/admin/actions");
const { updateProfile } = await import("@/features/account/actions");

const UUID = "5eed0000-0000-4000-8000-000000000001";
function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.append(k, v);
  return data;
}

const validInputs = {
  applyAsProvider: form({
    slug: "ziro-treks",
    displayName: "Ziro Treks",
    legalName: "Ziro Treks Pvt Ltd",
    contactEmail: "hello@zirotreks.example",
  }),
  submitForReview: form({ providerId: UUID }),
  addExperience: form({
    providerId: UUID,
    destinationId: UUID,
    slug: "ziro-walk",
    title: "Ziro walk",
    category: "culture",
    durationMinutes: "120",
  }),
  changeExperienceStatus: form({ experienceId: UUID, status: "published" }),
  changeExperienceAcceptsBookings: form({ experienceId: UUID, acceptsBookings: "false" }),
  reviewProviderAction: form({ providerId: UUID, decision: "verified" }),
  updateProfile: form({ displayName: "Asha" }),
};

const cases = [
  { name: "applyAsProvider", action: applyAsProvider, serverFn: "createProviderApplication" },
  { name: "submitForReview", action: submitForReview, serverFn: "submitProviderApplication" },
  { name: "addExperience", action: addExperience, serverFn: "createExperience" },
  {
    name: "changeExperienceStatus",
    action: changeExperienceStatus,
    serverFn: "setExperienceStatus",
  },
  {
    name: "changeExperienceAcceptsBookings",
    action: changeExperienceAcceptsBookings,
    serverFn: "setExperienceAcceptsBookings",
  },
  { name: "reviewProviderAction", action: reviewProviderAction, serverFn: "reviewProvider" },
  { name: "updateProfile", action: updateProfile, serverFn: "updateMyDisplayName" },
] as const;

beforeEach(() => {
  for (const fn of Object.values(server)) fn.mockReset();
  requireAccount.mockClear();
});

describe.each([
  ["applyAsProvider", applyAsProvider, "createProviderApplication"],
  ["submitForReview", submitForReview, "submitProviderApplication"],
  ["addExperience", addExperience, "createExperience"],
  ["changeExperienceStatus", changeExperienceStatus, "setExperienceStatus"],
  [
    "changeExperienceAcceptsBookings",
    changeExperienceAcceptsBookings,
    "setExperienceAcceptsBookings",
  ],
] as const)("%s is for partner accounts only", (name, action, serverFn) => {
  it("asks for a partner account and refuses others before the server layer", async () => {
    requireAccount.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "This isn't available to traveller accounts."),
    );
    const result = await action(null, validInputs[name]);
    expect(requireAccount).toHaveBeenCalledWith(["partner"]);
    expect(result).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "This isn't available to traveller accounts." },
    });
    expect(server[serverFn]).not.toHaveBeenCalled();
  });
});

describe.each(cases)("$name", ({ name, action, serverFn }) => {
  it("rejects invalid or tampered input without calling the server layer", async () => {
    const tampered = form({ unexpected: "x", status: "verified", role: "admin" });
    const result = await action(null, tampered);
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(server[serverFn]).not.toHaveBeenCalled();
  });

  it.each([
    ["UNAUTHENTICATED", "Please sign in to continue."],
    ["FORBIDDEN", "You don't have permission to do that."],
    ["NOT_FOUND", "We couldn't find that."],
  ] as const)("returns %s from the server layer as a safe failure", async (code, message) => {
    server[serverFn].mockRejectedValueOnce(
      new AppError(code, message, { cause: new Error("row-level security policy for table x") }),
    );
    const result = await action(null, validInputs[name]);
    expect(result).toEqual({ ok: false, error: { code, message } });
    expect(JSON.stringify(result)).not.toContain("row-level security");
  });

  it("hides unexpected errors behind INTERNAL", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server[serverFn].mockRejectedValueOnce(new Error('relation "providers" does not exist'));
    const result = await action(null, validInputs[name]);
    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    expect(JSON.stringify(result)).not.toContain("providers");
  });
});
