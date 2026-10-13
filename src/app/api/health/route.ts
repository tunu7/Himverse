import { connection } from "next/server";

import { logger } from "@/lib/logger";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/**
 * Liveness + database reachability for uptime monitors and post-deploy smoke
 * checks. Public and cheap: one indexed read as the anonymous role, no details
 * beyond pass/fail and the release, never cached.
 */
export async function GET() {
  await connection();
  let database: "ok" | "error" = "ok";
  try {
    // A GET, not a HEAD: PostgREST sends no error body for HEAD requests, so
    // supabase-js reports no error even when the table is missing.
    const { error, status } = await createSupabasePublicClient()
      .from("destinations")
      .select("id")
      .limit(1)
      .abortSignal(AbortSignal.timeout(3_000));
    if (error || status >= 400) throw error ?? new Error(`database returned ${status}`);
  } catch (error) {
    database = "error";
    logger.error("health.database_unreachable", { cause: error });
  }
  const ok = database === "ok";
  return Response.json(
    {
      status: ok ? "ok" : "degraded",
      checks: { database },
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
