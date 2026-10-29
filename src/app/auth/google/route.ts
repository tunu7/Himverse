import { type NextRequest, NextResponse } from "next/server";

import { getPublicEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { safeRedirectPath } from "@/lib/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkLimits, ipCheck, trustedClientIp } from "@/server/auth/request-limits";

/**
 * Starts "Continue with Google" (Supabase OAuth, PKCE). The code verifier is
 * stored in a cookie on this browser, so only this browser can finish the flow
 * at /auth/callback; an attacker can't sign a victim into the attacker's account.
 *
 * A GET link rather than a form post: the CSP's form-action 'self' would block a
 * form submission that redirects to Google.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const env = getPublicEnv();
  if (env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED !== "true") {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }
  const limit = await checkLimits(ipCheck("oauth_start_ip", await trustedClientIp()), {
    failClosed: false,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many attempts. Please try again later." } },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }
  // Forward `next` only when given, so the callback can land by role otherwise.
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"), "");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`,
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) {
    logger.error("auth.oauth_start_failed", { provider: "google", code: error?.code });
    return NextResponse.redirect(new URL("/sign-in?error=oauth_failed", origin));
  }
  return NextResponse.redirect(data.url);
}
