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
});

const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
});

// AI settings (ADR-0003). Kept separate from serverEnvSchema so AI code never
// depends on the Supabase secret key. The mock provider exists for automated
// tests and is refused in Vercel production.
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
  })
  .refine((env) => !(env.AI_PROVIDER === "mock" && env.VERCEL_ENV === "production"), {
    path: ["AI_PROVIDER"],
    message: "The mock AI provider is not allowed in production.",
  });

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
  });
  return cachedPublicEnv;
}
