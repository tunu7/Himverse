import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
};
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth }),
}));
const env = {
  NEXT_PUBLIC_SITE_URL: "https://himverse.example",
  NEXT_PUBLIC_SUPABASE_URL: "https://db.example",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pk",
  NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "true" as "true" | "false",
};
vi.mock("@/lib/env", () => ({ getPublicEnv: () => env }));

const { GET: startGoogle } = await import("@/app/auth/google/route");
const { GET: callback } = await import("@/app/auth/callback/route");

const req = (path: string) => new NextRequest(`https://himverse.example${path}`);
const location = (response: Response) => response.headers.get("location");

beforeEach(() => {
  env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED = "true";
  auth.signInWithOAuth.mockReset();
  auth.exchangeCodeForSession.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("GET /auth/google", () => {
  it("does nothing but return to sign-in when Google is disabled", async () => {
    env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED = "false";
    const response = await startGoogle(req("/auth/google"));
    expect(location(response)).toBe("https://himverse.example/sign-in");
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it("starts Google OAuth with a callback on our site and redirects to the provider", async () => {
    auth.signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.example/o" },
      error: null,
    });
    const response = await startGoogle(req("/auth/google?next=%2Fbookings"));
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://himverse.example/auth/callback?next=%2Fbookings",
        skipBrowserRedirect: true,
      },
    });
    expect(location(response)).toBe("https://accounts.google.example/o");
  });

  it.each(["//evil.example", "https://evil.example", "/\\evil.example"])(
    "never forwards an unsafe next (%s)",
    async (next) => {
      auth.signInWithOAuth.mockResolvedValue({ data: { url: "https://g.example" }, error: null });
      await startGoogle(req(`/auth/google?next=${encodeURIComponent(next)}`));
      expect(auth.signInWithOAuth.mock.calls[0]?.[0].options.redirectTo).toBe(
        "https://himverse.example/auth/callback?next=%2Faccount",
      );
    },
  );

  it("shows an error on sign-in when the provider can't be started", async () => {
    auth.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: { code: "provider_disabled" },
    });
    const response = await startGoogle(req("/auth/google"));
    expect(location(response)).toBe("https://himverse.example/sign-in?error=oauth_failed");
  });
});

describe("GET /auth/callback", () => {
  it("exchanges the code and continues to a safe internal path", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await callback(req("/auth/callback?code=abc&next=%2Fitineraries"));
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(location(response)).toBe("https://himverse.example/itineraries");
  });

  it("ignores an external next after a successful exchange", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await callback(req("/auth/callback?code=abc&next=%2F%2Fevil.example"));
    expect(location(response)).toBe("https://himverse.example/account");
  });

  it.each([
    ["cancelled consent", "/auth/callback?error=access_denied&error_description=denied"],
    ["missing code", "/auth/callback"],
  ])("fails safely on %s without exchanging", async (_name, path) => {
    const response = await callback(req(path));
    expect(location(response)).toBe("https://himverse.example/sign-in?error=oauth_failed");
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("fails safely when the code is invalid, reused or from another browser", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: { code: "bad_code_verifier" } });
    const response = await callback(req("/auth/callback?code=stolen"));
    expect(location(response)).toBe("https://himverse.example/sign-in?error=oauth_failed");
  });
});
