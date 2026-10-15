import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

import { getAssurance } from "./assurance";

export type SessionUser = { id: string; email: string | null };

/** One type per account (ADR-0007). Null until a Google sign-up chooses. */
export type AccountType = Database["public"]["Enums"]["account_type"];
export type Account = SessionUser & { accountType: AccountType | null };

/** Each account type's home: where it lands and where it's sent from other areas. */
export function homePathFor(accountType: AccountType | null): string {
  switch (accountType) {
    case "admin":
      return "/admin";
    case "partner":
      return "/provider";
    case "traveller":
      return "/account";
    case null:
      return "/welcome";
  }
}

/**
 * The verified current user, or null. `getClaims()` verifies the JWT, so this
 * never trusts unverified cookie contents. Memoised per request.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) {
    return null;
  }
  return { id: data.claims.sub, email: data.claims.email ?? null };
});

/**
 * The signed-in account with its type, or null when signed out. Read live
 * from the caller's own profile (RLS), so it's never taken from the session
 * cookie. Fails closed: a lookup error yields no type.
 */
export const getCurrentAccount = cache(async (): Promise<Account | null> => {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("account_type")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    logger.error("auth.account_lookup_failed", { userId: user.id, code: error.code });
  }
  return { ...user, accountType: error ? null : (data?.account_type ?? null) };
});

/**
 * Whether the current user holds the admin role. Read live from
 * `user_roles` under RLS (users can read only their own rows), so a revoked
 * role takes effect on the next request. See ADR-0002.
 */
export const isCurrentUserAdmin = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  if (!user) {
    return false;
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (error) {
    // Fail closed: an error never grants admin.
    logger.error("auth.role_lookup_failed", { userId: user.id, code: error.code });
    return false;
  }
  return data !== null;
});

/** For Server Actions: throws UNAUTHENTICATED when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AppError("UNAUTHENTICATED", "Please sign in to continue.");
  }
  return user;
}

const AREA_NAMES: Record<AccountType, string> = {
  traveller: "traveller",
  partner: "partner",
  admin: "admin",
};

/** Partner and admin accounts must pass two-step login (ADR-0007). */
function needsSecondStep(accountType: AccountType): boolean {
  return accountType === "partner" || accountType === "admin";
}

/**
 * For pages of partner and admin areas: sends a session that hasn't passed the
 * second step to set it up or to enter a code, then back to `returnTo`.
 */
async function requireSecondStepForPage(returnTo: string): Promise<void> {
  const assurance = await getAssurance();
  if (assurance?.aal === "aal2") return;
  const next = `next=${encodeURIComponent(returnTo)}`;
  redirect(assurance?.hasVerifiedTotp ? `/mfa/verify?${next}` : `/mfa/setup?${next}`);
}

/**
 * For Server Actions: throws unless the caller's account is one of `types`.
 * A UX guard with a clear message; the database enforces the same rules.
 */
export async function requireAccount(types: readonly AccountType[]): Promise<Account> {
  await requireUser();
  const account = await getCurrentAccount();
  if (!account?.accountType || !types.includes(account.accountType)) {
    throw new AppError(
      "FORBIDDEN",
      account?.accountType
        ? `This isn't available to ${AREA_NAMES[account.accountType]} accounts.`
        : "Finish setting up your account first.",
    );
  }
  if (needsSecondStep(account.accountType) && (await getAssurance())?.aal !== "aal2") {
    throw new AppError("FORBIDDEN", "Please complete two-step login first.");
  }
  return account;
}

/**
 * For pages in one account type's area: signed-out visitors go to sign in;
 * accounts without a type go to choose one; other types go to their own home.
 */
export async function requireAccountForPage(
  returnTo: string,
  types: readonly AccountType[],
): Promise<Account> {
  await requireUserForPage(returnTo);
  const account = await getCurrentAccount();
  if (!account?.accountType) {
    redirect(`/welcome?next=${encodeURIComponent(returnTo)}`);
  }
  if (!types.includes(account.accountType)) {
    redirect(homePathFor(account.accountType));
  }
  if (needsSecondStep(account.accountType)) {
    await requireSecondStepForPage(returnTo);
  }
  return account;
}

/** For Server Actions: throws unless the caller is an admin. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!(await isCurrentUserAdmin())) {
    throw new AppError("FORBIDDEN", "You don't have permission to do that.");
  }
  if ((await getAssurance())?.aal !== "aal2") {
    throw new AppError("FORBIDDEN", "Please complete two-step login first.");
  }
  return user;
}

/** For pages: redirects signed-out visitors to sign in, then back to `returnTo`. */
export async function requireUserForPage(returnTo: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  }
  return user;
}

/**
 * For admin pages: signed-out visitors go to sign in; signed-in non-admins get a
 * plain 404 so the admin area isn't revealed.
 */
export async function requireAdminForPage(returnTo: string): Promise<SessionUser> {
  const user = await requireUserForPage(returnTo);
  if (!(await isCurrentUserAdmin())) {
    notFound();
  }
  await requireSecondStepForPage(returnTo);
  return user;
}
