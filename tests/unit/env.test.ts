import { describe, expect, it } from "vitest";

import { EnvValidationError, parseAiEnv, parsePublicEnv, parseServerEnv } from "@/lib/env";

const validPublic = {
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
};

describe("parsePublicEnv", () => {
  it("accepts a complete, valid environment", () => {
    expect(parsePublicEnv(validPublic)).toEqual({
      ...validPublic,
      NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "false",
    });
  });

  it('enables Google sign-in only with an explicit "true"', () => {
    expect(
      parsePublicEnv({ ...validPublic, NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "true" })
        .NEXT_PUBLIC_AUTH_GOOGLE_ENABLED,
    ).toBe("true");
    expect(() =>
      parsePublicEnv({ ...validPublic, NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "yes" }),
    ).toThrow(EnvValidationError);
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

  it("defaults the model and timeout per provider", () => {
    expect(parseAiEnv({})).toMatchObject({
      AI_ITINERARY_MODEL: "anthropic/claude-sonnet-5.5",
      AI_MODEL_TIMEOUT_MS: 45_000,
    });
    expect(parseAiEnv({ AI_PROVIDER: "ollama" })).toMatchObject({
      AI_ITINERARY_MODEL: "himverse-planner",
      OLLAMA_BASE_URL: "http://127.0.0.1:11434/v1",
      AI_MODEL_TIMEOUT_MS: 180_000,
    });
  });

  it("switches models through env alone", () => {
    expect(
      parseAiEnv({
        AI_PROVIDER: "ollama",
        AI_ITINERARY_MODEL: "llama3.1:8b",
        AI_MODEL_TIMEOUT_MS: "300000",
      }),
    ).toMatchObject({ AI_ITINERARY_MODEL: "llama3.1:8b", AI_MODEL_TIMEOUT_MS: 300_000 });
    expect(parseAiEnv({ AI_ITINERARY_MODEL: "openai/gpt-5.1" }).AI_ITINERARY_MODEL).toBe(
      "openai/gpt-5.1",
    );
  });

  it.each([
    { AI_PROVIDER: "gateway", AI_ITINERARY_MODEL: "llama3.1:8b" },
    { AI_PROVIDER: "ollama", AI_ITINERARY_MODEL: "bad model; rm" },
    { AI_PROVIDER: "ollama", OLLAMA_BASE_URL: "file:///etc/passwd" },
    { AI_PROVIDER: "ollama", AI_MODEL_TIMEOUT_MS: "100" },
  ])("rejects invalid AI settings %o", (env) => {
    expect(() => parseAiEnv(env)).toThrow(EnvValidationError);
  });

  const cloud = {
    AI_PROVIDER: "ollama",
    OLLAMA_BASE_URL: "https://ollama.com/v1",
    OLLAMA_API_KEY: "test-key",
    AI_ITINERARY_MODEL: "gpt-oss:120b",
  };

  it.each(["production", "preview"])("accepts a remote HTTPS Ollama with a key on %s", (vercel) => {
    expect(parseAiEnv({ ...cloud, VERCEL_ENV: vercel })).toMatchObject({
      AI_PROVIDER: "ollama",
      OLLAMA_API_KEY: "test-key",
      AI_ITINERARY_MODEL: "gpt-oss:120b",
      AI_MODEL_TIMEOUT_MS: 90_000,
    });
  });

  it.each([
    {
      name: "a localhost URL",
      env: { OLLAMA_BASE_URL: "http://127.0.0.1:11434/v1" },
      key: "OLLAMA_BASE_URL",
    },
    {
      name: "plain HTTP",
      env: { OLLAMA_BASE_URL: "http://ollama.example.com/v1" },
      key: "OLLAMA_BASE_URL",
    },
    { name: "no API key", env: { OLLAMA_API_KEY: undefined }, key: "OLLAMA_API_KEY" },
    {
      name: "no explicit model",
      env: { AI_ITINERARY_MODEL: undefined },
      key: "AI_ITINERARY_MODEL",
    },
  ])("refuses a deployed Ollama with $name", ({ env, key }) => {
    for (const vercel of ["production", "preview"]) {
      expect(() => parseAiEnv({ ...cloud, ...env, VERCEL_ENV: vercel })).toThrow(key);
    }
  });

  it("keeps local Ollama free of deployment rules (no key, localhost, default model)", () => {
    expect(parseAiEnv({ AI_PROVIDER: "ollama", VERCEL_ENV: "development" })).toMatchObject({
      AI_ITINERARY_MODEL: "himverse-planner",
      AI_MODEL_TIMEOUT_MS: 180_000,
    });
  });
});
