import "server-only";

import { parseServerEnv, type ServerEnv } from "./env";

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
