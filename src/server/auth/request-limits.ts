import "server-only";

import { createHash } from "node:crypto";

import { headers } from "next/headers";

import { AppError } from "@/lib/errors";
import { getAuthLimitsEnv } from "@/lib/env.server";
import { logger } from "@/lib/logger";

import { hitRateLimit } from "./limiter-db";

/**
 * Request limits for sign-in, sign-up, email sends and phone codes (ADR-0011).
 * Supabase Auth's own limits see only our server's IP, so these add limits
 * per visitor IP and per email or phone number, counted atomically in Postgres
 * (migration request_rate_limits). Values are provisional starting points.
 *
 * When the counter can't be reached:
 * - sign-in, sign-up and email sends fail OPEN (logged): Supabase's limits and
 *   the CAPTCHA still apply, and locking everyone out is worse;
 * - SMS sends and code checks fail CLOSED: they cost money or guard a secret.
 */
type Rule = { limit: number; windowSeconds: number };

export const LIMITS = {
  sign_in_ip: { limit: 30, windowSeconds: 15 * 60 },
  // Per address: slows password guessing against one account. Temporary, so
  // an attacker can't lock someone out for long.
  sign_in_email: { limit: 10, windowSeconds: 15 * 60 },
  sign_up_ip: { limit: 10, windowSeconds: 60 * 60 },
  email_send_ip: { limit: 10, windowSeconds: 60 * 60 },
  email_send_email: { limit: 5, windowSeconds: 60 * 60 },
  oauth_start_ip: { limit: 30, windowSeconds: 15 * 60 },
  // SMS costs money and is the target of SMS pumping: tight per number and per
  // visitor, a 60-second resend cooldown, and a platform-wide daily budget.
  sms_send_cooldown: { limit: 1, windowSeconds: 60 },
  sms_send_phone: { limit: 5, windowSeconds: 60 * 60 },
  sms_send_ip: { limit: 10, windowSeconds: 60 * 60 },
  sms_verify_phone: { limit: 5, windowSeconds: 15 * 60 },
  sms_verify_ip: { limit: 30, windowSeconds: 15 * 60 },
} as const satisfies Record<string, Rule>;

export type Bucket = keyof typeof LIMITS | "sms_daily";

export type Check = { bucket: Bucket; key: string };

/**
 * The visitor's IP, only where it can be trusted: on Vercel, which sets
 * x-forwarded-for itself (a value sent by the client is not passed through).
 * Elsewhere the header is client-controlled, so no IP limits apply (local
 * development and tests).
 */
export async function trustedClientIp(): Promise<string | null> {
  if (process.env.VERCEL !== "1") return null;
  const first = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
  return first && /^[0-9a-fA-F:.]{2,45}$/.test(first) ? first : null;
}

function hashKey(bucket: Bucket, key: string): string {
  return createHash("sha256").update(`${bucket}\u0000${key}`).digest("hex");
}

function ruleFor(bucket: Bucket): Rule {
  if (bucket === "sms_daily") {
    return { limit: Math.max(1, getAuthLimitsEnv().SMS_DAILY_LIMIT), windowSeconds: 24 * 60 * 60 };
  }
  return LIMITS[bucket];
}

function waitMessage(seconds: number): string {
  if (seconds <= 90) return `Too many attempts. Please wait ${seconds} seconds and try again.`;
  return `Too many attempts. Please wait ${Math.ceil(seconds / 60)} minutes and try again.`;
}

export type LimitOutcome = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Counts one request in every bucket (all of them, so switching identifiers
 * doesn't skip a count) and reports the longest wait among those exceeded.
 */
export async function checkLimits(
  checks: readonly Check[],
  options: { failClosed: boolean },
): Promise<LimitOutcome> {
  if (checks.length === 0) return { allowed: true };
  if (checks.some((c) => c.bucket === "sms_daily") && getAuthLimitsEnv().SMS_DAILY_LIMIT === 0) {
    logger.warn("security.sms_budget_disabled");
    return { allowed: false, retryAfterSeconds: 3600 };
  }
  let hits;
  try {
    hits = await Promise.all(
      checks.map((c) =>
        hitRateLimit({ bucket: c.bucket, keyHash: hashKey(c.bucket, c.key), ...ruleFor(c.bucket) }),
      ),
    );
  } catch (error) {
    // Never the keys: they are emails, phone numbers and IPs.
    logger.error("security.rate_limit_unavailable", {
      buckets: checks.map((c) => c.bucket),
      failClosed: options.failClosed,
      cause: error instanceof Error ? error.name : "unknown",
    });
    if (options.failClosed) {
      throw new AppError(
        "UPSTREAM_UNAVAILABLE",
        "We can't send or check codes right now. Please try again shortly.",
        { cause: error },
      );
    }
    return { allowed: true };
  }
  const refused = checks.flatMap((c, i) => (hits[i]?.allowed === false ? [c.bucket] : []));
  if (refused.length === 0) return { allowed: true };
  const retryAfterSeconds = Math.max(...hits.map((h) => (h.allowed ? 0 : h.retryAfterSeconds)));
  logger.warn("security.rate_limited", { buckets: refused, retryAfterSeconds });
  return { allowed: false, retryAfterSeconds };
}

/** As `checkLimits`, but throws RATE_LIMITED (HTTP 429) when a limit is exceeded. */
export async function enforceLimits(
  checks: readonly Check[],
  options: { failClosed: boolean },
): Promise<void> {
  const outcome = await checkLimits(checks, options);
  if (!outcome.allowed) {
    throw new AppError("RATE_LIMITED", waitMessage(outcome.retryAfterSeconds));
  }
}

/** Email addresses are case-insensitive for counting. */
export function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

/** IP checks for a bucket, only when the visitor's IP is known. */
export function ipCheck(bucket: Bucket, ip: string | null): Check[] {
  return ip ? [{ bucket, key: ip }] : [];
}
