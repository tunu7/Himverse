import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

type Claims = { sub: string; email?: string; aal?: string } | null;
type RoleQueryResult = { data: { role: string } | null; error: { code: string } | null };

const fake = {
  claims: null as Claims,
  claimsError: null as unknown,
  roleResult: { data: null, error: null } as RoleQueryResult,
  roleFilters: [] as Array<[string, string]>,
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getClaims: async () => ({
        data: fake.claims ? { claims: fake.claims } : null,
        error: fake.claimsError,
      }),
      mfa: {
        listFactors: async () => ({ data: { totp: [{ id: "f1" }], all: [] }, error: null }),
      },
    },
    from: (table: string) => {
      expect(table).toBe("user_roles");
      const query = {
        select: () => query,
        eq: (column: string, value: string) => {
          fake.roleFilters.push([column, value]);
          return query;
        },
        maybeSingle: async () => fake.roleResult,
      };
      return query;
    },
  }),
}));

const USER = "11111111-1111-4111-8111-111111111111";

// React's cache() memoises per request in RSC; re-import per test for isolation.
async function loadSession() {
  vi.resetModules();
  return import("@/server/auth/session");
}

beforeEach(() => {
  fake.claims = null;
  fake.claimsError = null;
  fake.roleResult = { data: null, error: null };
  fake.roleFilters = [];
});

describe("getCurrentUser", () => {
  it("returns null when there is no verified session", async () => {
    const { getCurrentUser } = await loadSession();
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null when JWT verification fails", async () => {
    fake.claims = { sub: USER };
    fake.claimsError = new Error("invalid JWT");
    const { getCurrentUser } = await loadSession();
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns the verified subject", async () => {
    fake.claims = { sub: USER, email: "a@example.test" };
    const { getCurrentUser } = await loadSession();
    expect(await getCurrentUser()).toEqual({ id: USER, email: "a@example.test" });
  });
});

describe("admin checks", () => {
  it("is not admin when signed out, without querying roles", async () => {
    const { isCurrentUserAdmin } = await loadSession();
    expect(await isCurrentUserAdmin()).toBe(false);
    expect(fake.roleFilters).toEqual([]);
  });

  it("queries the caller's own admin role row", async () => {
    fake.claims = { sub: USER };
    fake.roleResult = { data: { role: "admin" }, error: null };
    const { isCurrentUserAdmin } = await loadSession();
    expect(await isCurrentUserAdmin()).toBe(true);
    expect(fake.roleFilters).toEqual([
      ["user_id", USER],
      ["role", "admin"],
    ]);
  });

  it("fails closed when the role lookup errors", async () => {
    fake.claims = { sub: USER };
    fake.roleResult = { data: { role: "admin" }, error: { code: "57014" } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { isCurrentUserAdmin } = await loadSession();
    expect(await isCurrentUserAdmin()).toBe(false);
  });

  it("requireAdmin rejects signed-out callers as UNAUTHENTICATED", async () => {
    const { requireAdmin } = await loadSession();
    await expect(requireAdmin()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("requireAdmin rejects travelers as FORBIDDEN", async () => {
    fake.claims = { sub: USER };
    const { requireAdmin } = await loadSession();
    await expect(requireAdmin()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requireAdmin returns the admin user after the second step (aal2)", async () => {
    fake.claims = { sub: USER, aal: "aal2" };
    fake.roleResult = { data: { role: "admin" }, error: null };
    const { requireAdmin } = await loadSession();
    await expect(requireAdmin()).resolves.toEqual({ id: USER, email: null });
  });

  it("requireAdmin refuses an admin who hasn't passed two-step login", async () => {
    fake.claims = { sub: USER, aal: "aal1" };
    fake.roleResult = { data: { role: "admin" }, error: null };
    const { requireAdmin } = await loadSession();
    await expect(requireAdmin()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("requireUserForPage", () => {
  it("redirects signed-out visitors to sign in with an encoded return path", async () => {
    const { requireUserForPage } = await loadSession();
    await expect(requireUserForPage("/admin/providers")).rejects.toThrow(
      "REDIRECT:/sign-in?next=%2Fadmin%2Fproviders",
    );
  });
});
