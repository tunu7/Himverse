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

export type PublicEnv = z.infer<typeof publicEnvSchema>;
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
