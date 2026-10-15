import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const resetParamsSchema = z.object({ code: z.string().min(1).max(512) });

/**
 * Password-reset link target. PKCE only: the code can be exchanged only in the
 * browser that asked for the reset (its verifier cookie), so a reset link
 * can't sign someone else into an attacker's account. The resulting session
 * is marked as a recovery sign-in, which /reset-password requires.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const params = resetParamsSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!params.success) {
    return NextResponse.redirect(new URL("/forgot-password?error=expired", origin));
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(params.data.code);
  if (error) {
    logger.warn("auth.password_reset_exchange_failed", { code: error.code });
    return NextResponse.redirect(new URL("/forgot-password?error=expired", origin));
  }
  return NextResponse.redirect(new URL("/reset-password", origin));
}
