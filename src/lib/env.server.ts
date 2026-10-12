import "server-only";

import { type AiEnv, parseAiEnv, parseServerEnv, type ServerEnv } from "./env";

let cachedServerEnv: ServerEnv | undefined;

/**
 * Server-only secrets. Importing this module from a Client Component fails the
 * build, which keeps the Supabase secret key out of browser bundles.
 */
export function getServerEnv(): ServerEnv {
  cachedServerEnv ??= parseServerEnv({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
  return cachedServerEnv;
}

let cachedAiEnv: AiEnv | undefined;

/** AI provider settings, including the optional AI Gateway key (server-only). */
export function getAiEnv(): AiEnv {
  cachedAiEnv ??= parseAiEnv({
    AI_PROVIDER: process.env.AI_PROVIDER || undefined,
    AI_ITINERARY_MODEL: process.env.AI_ITINERARY_MODEL || undefined,
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY || undefined,
    VERCEL_ENV: process.env.VERCEL_ENV || undefined,
  });
  return cachedAiEnv;
}
