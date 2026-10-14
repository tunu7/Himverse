import { z } from "zod";

/**
 * Environment variable contract. See docs/operations/ENVIRONMENTS.md.
 *
 * Values are validated lazily (on first access) so `next build` does not
 * require secrets. Public values must be referenced as literal
 * `process.env.NEXT_PUBLIC_*` expressions so Next.js can inline them into
 * client bundles.
 */

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  // Shows "Continue with Google". Enable only after the Google provider is
  // configured in Supabase Auth (docs/operations/ENVIRONMENTS.md).
  NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: z.enum(["true", "false"]).default("false"),
});

const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
});

// AI settings (ADR-0003, ADR-0006). Kept separate from serverEnvSchema so AI code
// never depends on the Supabase secret key. Providers:
// - gateway: Vercel AI Gateway; AI_ITINERARY_MODEL is "provider/model".
// - ollama: a local or self-hosted Ollama server (free, no key); the model is an
//   Ollama tag. The default is built by `npm run ai:ollama` with a context window
//   large enough for our prompts (Ollama's default silently truncates them).
// - mock: deterministic, for automated tests. Refused in Vercel production, and
//   in any production build (next start) unless AI_ALLOW_MOCK=true is set
//   explicitly, as the E2E web server does.
export const DEFAULT_ITINERARY_MODEL = "anthropic/claude-sonnet-5.5";
export const DEFAULT_OLLAMA_MODEL = "himverse-planner";
export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1";
// Per-call model timeouts. Local models are much slower than hosted ones.
export const DEFAULT_MODEL_TIMEOUT_MS = { gateway: 45_000, ollama: 180_000, mock: 45_000 } as const;

const GATEWAY_MODEL = /^[a-z0-9-]+\/[a-z0-9.-]+$/;
// Ollama tags: "llama3.1:8b", "qwen2.5:7b-instruct", "hf.co/org/model:Q4_K_M".
const OLLAMA_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const aiEnvSchema = z
  .object({
    AI_PROVIDER: z.enum(["gateway", "ollama", "mock"]).default("gateway"),
    // Optional: each provider has its own default (see aiModelDefaults below).
    AI_ITINERARY_MODEL: z.string().max(100).optional(),
    // Optional: on Vercel the gateway authenticates with OIDC instead.
    AI_GATEWAY_API_KEY: z.string().min(1).optional(),
    // Ollama's OpenAI-compatible endpoint.
    OLLAMA_BASE_URL: z.url({ protocol: /^https?$/ }).default(DEFAULT_OLLAMA_BASE_URL),
    AI_MODEL_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(600_000).optional(),
    VERCEL_ENV: z.string().optional(),
    NODE_ENV: z.string().optional(),
    AI_ALLOW_MOCK: z.enum(["true", "false"]).default("false"),
    // Kill switch: set to "false" to stop all itinerary generation immediately.
    AI_ITINERARY_ENABLED: z.enum(["true", "false"]).default("true"),
    // Platform-wide cap on model-calling generations per day (IST), across all users.
    AI_DAILY_GENERATION_LIMIT: z.coerce.number().int().min(0).max(100_000).default(300),
  })
  .refine(
    (env) =>
      env.AI_PROVIDER !== "mock" ||
      (env.VERCEL_ENV !== "production" &&
        (env.NODE_ENV !== "production" || env.AI_ALLOW_MOCK === "true")),
    {
      path: ["AI_PROVIDER"],
      message: "The mock AI provider is not allowed in production.",
    },
  )
  .refine(
    (env) =>
      env.AI_ITINERARY_MODEL === undefined ||
      (env.AI_PROVIDER === "ollama" ? OLLAMA_MODEL : GATEWAY_MODEL).test(env.AI_ITINERARY_MODEL),
    { path: ["AI_ITINERARY_MODEL"], message: "Invalid model name for this AI provider." },
  )
  .refine(
    // A deployed function can't reach the developer's machine: fail loudly at
    // startup instead of on every generation.
    (env) =>
      env.AI_PROVIDER !== "ollama" ||
      (env.VERCEL_ENV !== "production" && env.VERCEL_ENV !== "preview") ||
      !LOOPBACK_HOSTS.has(new URL(env.OLLAMA_BASE_URL).hostname),
    { path: ["OLLAMA_BASE_URL"], message: "Ollama on localhost is unreachable from Vercel." },
  )
  .transform((env) => ({
    ...env,
    AI_ITINERARY_MODEL:
      env.AI_ITINERARY_MODEL ??
      (env.AI_PROVIDER === "ollama" ? DEFAULT_OLLAMA_MODEL : DEFAULT_ITINERARY_MODEL),
    AI_MODEL_TIMEOUT_MS: env.AI_MODEL_TIMEOUT_MS ?? DEFAULT_MODEL_TIMEOUT_MS[env.AI_PROVIDER],
  }));

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type AiEnv = z.output<typeof aiEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvValidationError extends Error {
  override readonly name = "EnvValidationError";

  constructor(readonly missingOrInvalid: readonly string[]) {
    // Never include values in the message: they may be secrets.
    super(`Invalid or missing environment variables: ${missingOrInvalid.join(", ")}`);
  }
}

function parse<T extends z.ZodType>(schema: T, source: Record<string, unknown>): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new EnvValidationError(keys);
  }
  return result.data;
}

export function parsePublicEnv(source: Record<string, unknown>): PublicEnv {
  return parse(publicEnvSchema, source);
}

export function parseServerEnv(source: Record<string, unknown>): ServerEnv {
  return parse(serverEnvSchema, source);
}

export function parseAiEnv(source: Record<string, unknown>): AiEnv {
  return parse(aiEnvSchema, source);
}

let cachedPublicEnv: PublicEnv | undefined;

/** Safe to call from client and server code. */
export function getPublicEnv(): PublicEnv {
  cachedPublicEnv ??= parsePublicEnv({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED || undefined,
  });
  return cachedPublicEnv;
}
