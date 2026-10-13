import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { safeRedirectPath } from "@/lib/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { landingPathFor } from "@/server/auth/landing";

const callbackParamsSchema = z.object({
  code: z.string().min(1).max(512),
  next: z.string().max(512).optional(),
});

/** OAuth return target (Google). Exchanges the PKCE code for a session. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const failure = new URL("/sign-in?error=oauth_failed", origin);
  // Cancelled consent or a provider error arrives as ?error=…; no code.
  const params = callbackParamsSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!params.success) {
    return NextResponse.redirect(failure);
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(params.data.code);
  if (error) {
    logger.warn("auth.oauth_exchange_failed", { code: error.code });
    return NextResponse.redirect(failure);
  }
  const destination = params.data.next
    ? safeRedirectPath(params.data.next)
    : await landingPathFor(supabase, data.user.id);
  return NextResponse.redirect(new URL(destination, origin));
}
