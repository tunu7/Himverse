import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { safeRedirectPath } from "@/lib/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Only the flows this app sends. Magic-link, recovery and invite tokens are refused:
// an attacker can request those for their own account at will and use the link to
// sign a victim into the attacker's account (login CSRF).
const otpTypes = ["signup", "email_change"] as const satisfies readonly EmailOtpType[];

// Two link formats are accepted:
// - PKCE (`?code=`): the default for @supabase/ssr and Supabase's default email
//   templates. Must be opened in the browser that signed up (code verifier cookie).
// - Token hash (`?token_hash=&type=`): works on any device; requires a custom
//   email template linking to /auth/confirm (see docs/operations/ENVIRONMENTS.md).
const confirmParamsSchema = z.union([
  z.object({ code: z.string().min(1).max(512), next: z.string().max(512).optional() }),
  z.object({
    token_hash: z.string().min(1).max(512),
    type: z.enum(otpTypes),
    next: z.string().max(512).optional(),
  }),
]);

/** Email confirmation link target. */
export async function GET(request: NextRequest) {
  const params = confirmParamsSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  const failure = new URL("/sign-in?error=confirmation_failed", request.nextUrl.origin);
  if (!params.success) {
    return NextResponse.redirect(failure);
  }

  const supabase = await createSupabaseServerClient();
  const { error } =
    "code" in params.data
      ? await supabase.auth.exchangeCodeForSession(params.data.code)
      : await supabase.auth.verifyOtp({
          type: params.data.type,
          token_hash: params.data.token_hash,
        });
  if (error) {
    return NextResponse.redirect(failure);
  }
  return NextResponse.redirect(new URL(safeRedirectPath(params.data.next), request.nextUrl.origin));
}
