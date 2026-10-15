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
  // Shown on the privacy and terms pages when set.
  NEXT_PUBLIC_SUPPORT_EMAIL: z.email().optional(),
});

const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
});

// AI settings (ADR-0003, ADR-0006). Kept separate from serverEnvSchema so AI code
// never depends on the Supabase secret key. Providers:
// - gateway: Vercel AI Gateway; AI_ITINERARY_MODEL is "provider/model".
// - ollama: Ollama's OpenAI-compatible API, the model is an Ollama tag. Locally,
//   no key is needed; the default is built by `npm run ai:ollama` with a context
//   window large enough for our prompts (Ollama's default silently truncates
//   them). Deployed (Vercel preview/production), it must be a remote HTTPS
//   endpoint (Ollama Cloud, or a self-hosted server behind an auth proxy) with
//   OLLAMA_API_KEY and an explicit AI_ITINERARY_MODEL.
// - mock: deterministic, for automated tests. Refused in Vercel production, and
//   in any production build (next start) unless AI_ALLOW_MOCK=true is set
//   explicitly, as the E2E web server does.
export const DEFAULT_ITINERARY_MODEL = "anthropic/claude-sonnet-5.5";
export const DEFAULT_OLLAMA_MODEL = "himverse-planner";
export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1";
// Per-call model timeouts. Models on this machine are much slower than hosted
// ones. Remote models keep two attempts (one repair) inside Vercel's 300 s limit.
export const DEFAULT_MODEL_TIMEOUT_MS = {
  gateway: 45_000,
  ollamaLocal: 180_000,
  ollamaRemote: 90_000,
  mock: 45_000,
} as const;

const GATEWAY_MODEL = /^[a-z0-9-]+\/[a-z0-9.-]+$/;
// Ollama tags: "llama3.1:8b", "qwen2.5:7b-instruct", "hf.co/org/model:Q4_K_M".
const OLLAMA_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const aiEnvSchema = z
  .object({
    AI_PROVIDER: z.enum(["gateway", "ollama", "mock"]).default("gateway"),
    // Optional locally: each provider has its own default (see the transform below).
    AI_ITINERARY_MODEL: z.string().max(100).optional(),
    // Optional: on Vercel the gateway authenticates with OIDC instead.
    AI_GATEWAY_API_KEY: z.string().min(1).optional(),
    // Ollama's OpenAI-compatible endpoint.
    OLLAMA_BASE_URL: z.url({ protocol: /^https?$/ }).default(DEFAULT_OLLAMA_BASE_URL),
    // Bearer token for Ollama Cloud or an auth proxy in front of Ollama. Never NEXT_PUBLIC_.
    OLLAMA_API_KEY: z.string().min(1).optional(),
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
  .superRefine((env, ctx) => {
    if (env.AI_PROVIDER !== "ollama" || !isDeployed(env.VERCEL_ENV)) return;
    // A deployed function can't reach the developer's machine, and a remote
    // Ollama must not be open to the internet: fail loudly at startup instead
    // of on every generation.
    const url = new URL(env.OLLAMA_BASE_URL);
    if (LOOPBACK_HOSTS.has(url.hostname)) {
      ctx.addIssue({
        code: "custom",
        path: ["OLLAMA_BASE_URL"],
        message: "Unreachable from Vercel.",
      });
    } else if (url.protocol !== "https:") {
      ctx.addIssue({ code: "custom", path: ["OLLAMA_BASE_URL"], message: "Must use HTTPS." });
    }
    if (!env.OLLAMA_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["OLLAMA_API_KEY"],
        message: "Required when deployed.",
      });
    }
    // himverse-planner exists only where `npm run ai:ollama` ran.
    if (!env.AI_ITINERARY_MODEL) {
      ctx.addIssue({
        code: "custom",
        path: ["AI_ITINERARY_MODEL"],
        message: "Required when deployed.",
      });
    }
  })
  .transform((env) => ({
    ...env,
    AI_ITINERARY_MODEL:
      env.AI_ITINERARY_MODEL ??
      (env.AI_PROVIDER === "ollama" ? DEFAULT_OLLAMA_MODEL : DEFAULT_ITINERARY_MODEL),
    AI_MODEL_TIMEOUT_MS: env.AI_MODEL_TIMEOUT_MS ?? defaultTimeout(env),
  }));

function isDeployed(vercelEnv: string | undefined): boolean {
  return vercelEnv === "production" || vercelEnv === "preview";
}

function defaultTimeout(env: {
  AI_PROVIDER: "gateway" | "ollama" | "mock";
  OLLAMA_BASE_URL: string;
}) {
  if (env.AI_PROVIDER !== "ollama") return DEFAULT_MODEL_TIMEOUT_MS[env.AI_PROVIDER];
  return LOOPBACK_HOSTS.has(new URL(env.OLLAMA_BASE_URL).hostname)
    ? DEFAULT_MODEL_TIMEOUT_MS.ollamaLocal
    : DEFAULT_MODEL_TIMEOUT_MS.ollamaRemote;
}

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

/**
 * The optional support address, on its own: static pages show it, and the
 * build prerenders them without the other environment variables.
 */
export function getSupportEmail(): string | undefined {
  const parsed = z.email().safeParse(process.env.NEXT_PUBLIC_SUPPORT_EMAIL);
  return parsed.success ? parsed.data : undefined;
}

/** Safe to call from client and server code. */
export function getPublicEnv(): PublicEnv {
  cachedPublicEnv ??= parsePublicEnv({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED || undefined,
    NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || undefined,
  });
  return cachedPublicEnv;
}
