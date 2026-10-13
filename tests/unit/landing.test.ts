import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { landingPathFor } = await import("@/server/auth/landing");

type Rows = { data: unknown[] | null; error: { message: string } | null };
function client(roles: Rows, members: Rows) {
  const table = (rows: Rows) => {
    const q = { select: () => q, eq: () => q, limit: () => Promise.resolve(rows) };
    return q;
  };
  return {
    from: (name: string) => table(name === "user_roles" ? roles : members),
  } as unknown as Parameters<typeof landingPathFor>[0];
}
const none: Rows = { data: [], error: null };
const one: Rows = { data: [{}], error: null };
const failed: Rows = { data: null, error: { message: "boom" } };

describe("landingPathFor", () => {
  it("sends admins to the console, even if they are also partners", async () => {
    expect(await landingPathFor(client(one, one), "u")).toBe("/admin");
  });
  it("sends tourism partners to their portal", async () => {
    expect(await landingPathFor(client(none, one), "u")).toBe("/provider");
  });
  it("sends everyone else to their account", async () => {
    expect(await landingPathFor(client(none, none), "u")).toBe("/account");
  });
  it("falls back to the traveller page when lookups fail (never grants an area)", async () => {
    expect(await landingPathFor(client(failed, failed), "u")).toBe("/account");
  });
});
