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
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || undefined,
    OLLAMA_API_KEY: process.env.OLLAMA_API_KEY || undefined,
    AI_MODEL_TIMEOUT_MS: process.env.AI_MODEL_TIMEOUT_MS || undefined,
    VERCEL_ENV: process.env.VERCEL_ENV || undefined,
    NODE_ENV: process.env.NODE_ENV || undefined,
    AI_ALLOW_MOCK: process.env.AI_ALLOW_MOCK || undefined,
    AI_ITINERARY_ENABLED: process.env.AI_ITINERARY_ENABLED || undefined,
    AI_DAILY_GENERATION_LIMIT: process.env.AI_DAILY_GENERATION_LIMIT || undefined,
  });
  return cachedAiEnv;
}
