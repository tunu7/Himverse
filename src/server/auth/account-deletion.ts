import "server-only";

import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { toAppError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { getAssurance } from "./assurance";
import { verifySecondStep } from "./mfa";
import { hasPasswordSignIn, reauthenticateWithPassword } from "./passwords";
import { requireUser } from "./session";

/** The database requires a sign-in this recent before deleting an account (ADR-0009). */
export const RECENT_SIGN_IN_SECONDS = 15 * 60;

/** Sign-in methods that prove the person is present (not, say, an invite link). */
const FRESH_METHODS = new Set(["password", "oauth", "totp", "otp", "recovery"]);

/** A sign-in by one of those methods within the last `maxAgeSeconds`. */
export function signedInRecently(
  methods: { method: string; at: number | null }[],
  maxAgeSeconds: number,
  now = Date.now(),
): boolean {
  return methods.some(
    (m) => FRESH_METHODS.has(m.method) && m.at !== null && now / 1000 - m.at <= maxAgeSeconds,
  );
}

const SIGN_IN_AGAIN = "For your security, sign out and sign in again, then delete your account.";

/** Database refusals the user can act on, keyed by the function's `hint` (migration account_deletion). */
const REFUSALS: Record<string, { code: "FORBIDDEN" | "CONFLICT"; message: string }> = {
  admin: {
    code: "FORBIDDEN",
    message: "Admin accounts can't be deleted here. Ask the platform owner.",
  },
  second_step: { code: "FORBIDDEN", message: "Verify your two-step login first." },
  reauthenticate: { code: "FORBIDDEN", message: SIGN_IN_AGAIN },
  open_business_bookings: {
    code: "CONFLICT",
    message:
      "Your business has open booking requests or upcoming confirmed bookings. Answer or cancel them first, or add another team member.",
  },
  booking_under_way: {
    code: "CONFLICT",
    message:
      "You have a confirmed booking starting within 24 hours or under way. You can delete your account after it ends.",
  },
};

/** How the person proves it's them right now: their authenticator, password, or a recent Google sign-in. */
export type ReauthMethod = "code" | "password" | "recent-sign-in";

export async function reauthMethodFor(): Promise<ReauthMethod> {
  const assurance = await getAssurance();
  if (assurance?.hasVerifiedTotp) return "code";
  return (await hasPasswordSignIn()) ? "password" : "recent-sign-in";
}

/**
 * Permanently deletes the signed-in traveller or partner account (ADR-0009).
 * First refreshes the session's sign-in (authenticator code or password), or
 * requires a recent Google sign-in; the database checks that freshness itself,
 * cancels open bookings, anonymises the rest and removes the login.
 */
export async function deleteMyAccount(input: {
  password?: string;
  code?: string;
  captchaToken?: string;
}): Promise<void> {
  const user = await requireUser();
  const method = await reauthMethodFor();
  if (method === "code") {
    if (!input.code) {
      throw new AppError("VALIDATION_FAILED", "Please check the highlighted fields.", {
        fieldErrors: { code: ["Enter the 6-digit code from your authenticator app."] },
      });
    }
    await verifySecondStep(input.code);
  } else if (method === "password") {
    await reauthenticateWithPassword(user, input.password ?? "", input.captchaToken);
  } else {
    const assurance = await getAssurance();
    if (!assurance || !signedInRecently(assurance.methods, RECENT_SIGN_IN_SECONDS)) {
      throw new AppError("FORBIDDEN", SIGN_IN_AGAIN);
    }
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    const refusal = error.hint ? REFUSALS[error.hint] : undefined;
    if (refusal) throw new AppError(refusal.code, refusal.message, { cause: error });
    throw toAppError(error, "We couldn't delete your account. Please try again.");
  }
  logger.info("account.deleted", { userId: user.id });
  // The login no longer exists; clear this browser's session cookies.
  const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
  if (signOutError) logger.warn("account.deleted_sign_out_failed", { code: signOutError.code });
}
