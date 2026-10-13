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

// AI settings (ADR-0003). Kept separate from serverEnvSchema so AI code never
// depends on the Supabase secret key. The mock provider exists for automated
// tests: refused in Vercel production, and in any production build (next start)
// unless AI_ALLOW_MOCK=true is set explicitly, as the E2E web server does.
export const DEFAULT_ITINERARY_MODEL = "anthropic/claude-sonnet-5.5";

const aiEnvSchema = z
  .object({
    AI_PROVIDER: z.enum(["gateway", "mock"]).default("gateway"),
    AI_ITINERARY_MODEL: z
      .string()
      .regex(/^[a-z0-9-]+\/[a-z0-9.-]+$/)
      .default(DEFAULT_ITINERARY_MODEL),
    // Optional: on Vercel the gateway authenticates with OIDC instead.
    AI_GATEWAY_API_KEY: z.string().min(1).optional(),
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
  );

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type AiEnv = z.infer<typeof aiEnvSchema>;
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
