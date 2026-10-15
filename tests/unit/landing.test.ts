import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { landingPathFor } = await import("@/server/auth/landing");

type Row = { data: { account_type: string | null } | null; error: { message: string } | null };
function client(row: Row) {
  const q = { select: () => q, eq: () => q, maybeSingle: () => Promise.resolve(row) };
  return { from: () => q } as unknown as Parameters<typeof landingPathFor>[0];
}
const typed = (accountType: string | null): Row => ({
  data: { account_type: accountType },
  error: null,
});

// One home per account type (ADR-0007).
describe("landingPathFor", () => {
  it.each([
    ["admin", "/admin"],
    ["partner", "/provider"],
    ["traveller", "/account"],
  ])("sends %s accounts to %s", async (accountType, path) => {
    expect(await landingPathFor(client(typed(accountType)), "u")).toBe(path);
  });
  it("sends accounts without a type (new Google sign-ups) to choose one", async () => {
    expect(await landingPathFor(client(typed(null)), "u")).toBe("/welcome");
  });
  it("never grants an area when the lookup fails", async () => {
    expect(await landingPathFor(client({ data: null, error: { message: "boom" } }), "u")).toBe(
      "/welcome",
    );
  });
});
