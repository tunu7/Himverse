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
    const { error } = await createSupabasePublicClient()
      .from("destinations")
      .select("id", { head: true })
      .limit(1)
      .abortSignal(AbortSignal.timeout(3_000));
    if (error) throw error;
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
