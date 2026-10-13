import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SessionUser = { id: string; email: string | null };

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

/**
 * Whether the current user belongs to any provider (a tourism partner). Used
 * only for navigation; partner permissions are enforced by RLS per provider.
 */
export const isCurrentUserPartner = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  if (!user) {
    return false;
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("provider_members")
    .select("provider_id")
    .eq("user_id", user.id)
    .limit(1);
  return !error && data.length > 0;
});

/** For Server Actions: throws UNAUTHENTICATED when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AppError("UNAUTHENTICATED", "Please sign in to continue.");
  }
  return user;
}

/** For Server Actions: throws unless the caller is an admin. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!(await isCurrentUserAdmin())) {
    throw new AppError("FORBIDDEN", "You don't have permission to do that.");
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
  return user;
}
