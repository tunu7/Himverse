import { describe, expect, it } from "vitest";

import { EnvValidationError, parseAiEnv, parsePublicEnv, parseServerEnv } from "@/lib/env";

const validPublic = {
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
};

describe("parsePublicEnv", () => {
  it("accepts a complete, valid environment", () => {
    expect(parsePublicEnv(validPublic)).toEqual(validPublic);
  });

  it("reports every missing or invalid key", () => {
    const run = () =>
      parsePublicEnv({
        ...validPublic,
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SITE_URL: undefined,
      });

    expect(run).toThrow(EnvValidationError);
    try {
      run();
    } catch (error) {
      expect((error as EnvValidationError).missingOrInvalid).toEqual(
        expect.arrayContaining(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SITE_URL"]),
      );
    }
  });
});

describe("parseServerEnv", () => {
  it("never includes secret values in the error message", () => {
    const secret = "sb_secret_should_never_leak";
    try {
      parseServerEnv({ SUPABASE_SECRET_KEY: "", UNRELATED: secret });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as Error).message).not.toContain(secret);
      expect((error as Error).message).toContain("SUPABASE_SECRET_KEY");
    }
  });
});

describe("parseAiEnv", () => {
  it("defaults to the gateway with generation enabled", () => {
    expect(parseAiEnv({})).toMatchObject({
      AI_PROVIDER: "gateway",
      AI_ITINERARY_ENABLED: "true",
      AI_DAILY_GENERATION_LIMIT: 300,
    });
  });

  it("allows the mock model in development", () => {
    expect(parseAiEnv({ AI_PROVIDER: "mock", NODE_ENV: "development" }).AI_PROVIDER).toBe("mock");
  });

  it.each([
    { name: "Vercel production", env: { VERCEL_ENV: "production", NODE_ENV: "production" } },
    {
      name: "Vercel production even when explicitly allowed",
      env: { VERCEL_ENV: "production", NODE_ENV: "production", AI_ALLOW_MOCK: "true" },
    },
    { name: "a production build without the opt-in", env: { NODE_ENV: "production" } },
  ])("refuses the mock model in $name", ({ env }) => {
    expect(() => parseAiEnv({ AI_PROVIDER: "mock", ...env })).toThrow(EnvValidationError);
  });

  it("allows the mock model in a non-Vercel production build only with AI_ALLOW_MOCK=true", () => {
    expect(
      parseAiEnv({ AI_PROVIDER: "mock", NODE_ENV: "production", AI_ALLOW_MOCK: "true" })
        .AI_PROVIDER,
    ).toBe("mock");
  });
});
