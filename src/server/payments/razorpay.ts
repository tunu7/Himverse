import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { getPaymentsEnv } from "@/lib/env.server";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Razorpay REST API (Orders, Payments, Refunds) over fetch, without an SDK
 * (ADR-0005). Verified against Razorpay's documentation on 2026-10-15:
 * - orders: POST /v1/orders {amount (paise), currency, receipt ≤ 40 chars, unique, notes};
 * - payments: GET /v1/payments/{id}; status created|authorized|captured|refunded|failed;
 *   payments on orders are auto-captured by default;
 * - refunds: POST /v1/payments/{id}/refund {amount, receipt, notes} with header
 *   X-Refund-Idempotency (≥ 10 chars; a retry with the same key and body returns the
 *   same refund); GET /v1/refunds/{id}; status pending|processed|failed;
 * - checkout signature: HMAC-SHA256(order_id + "|" + payment_id, key secret), hex;
 * - webhook signature: X-Razorpay-Signature = HMAC-SHA256(raw body, webhook secret), hex.
 */

const TIMEOUT_MS = 10_000;

type Keys = { keyId: string; keySecret: string; webhookSecret: string; apiBase: string };

/** The Razorpay keys, or null when payments aren't configured. */
export function razorpayKeys(): Keys | null {
  const env = getPaymentsEnv();
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || !env.RAZORPAY_WEBHOOK_SECRET) return null;
  return {
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
    apiBase: env.RAZORPAY_API_BASE.replace(/\/$/, ""),
  };
}

function requireKeys(): Keys {
  const keys = razorpayKeys();
  if (!keys)
    throw new AppError("UPSTREAM_UNAVAILABLE", "Online payments aren't available right now.");
  return keys;
}

const UNAVAILABLE = "The payment service didn't respond. Please try again in a moment.";

async function call<T extends z.ZodType>(
  method: "GET" | "POST",
  path: string,
  schema: T,
  body?: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Promise<z.infer<T>> {
  const keys = requireKeys();
  let response: Response;
  try {
    response = await fetch(`${keys.apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString("base64")}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (cause) {
    throw new AppError("UPSTREAM_UNAVAILABLE", UNAVAILABLE, { cause });
  }
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    // Razorpay errors: { error: { code, description, ... } }; log the code only.
    const code = z.object({ error: z.object({ code: z.string() }) }).safeParse(json);
    logger.warn("payments.razorpay_error", {
      path: path.replace(/\/(order|pay|rfnd)_[A-Za-z0-9]+/g, "/$1_…"),
      status: response.status,
      code: code.success ? code.data.error.code : null,
    });
    throw new AppError(
      response.status >= 500 ? "UPSTREAM_UNAVAILABLE" : "INTERNAL",
      response.status >= 500 ? UNAVAILABLE : "The payment service refused the request.",
      { cause: { status: response.status } },
    );
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new AppError("UPSTREAM_UNAVAILABLE", UNAVAILABLE, { cause: parsed.error });
  }
  return parsed.data;
}

const orderSchema = z.object({
  id: z.string().regex(/^order_[A-Za-z0-9]{8,40}$/),
  amount: z.number().int(),
  currency: z.string(),
});

const paymentSchema = z.object({
  id: z.string().regex(/^pay_[A-Za-z0-9]{8,40}$/),
  order_id: z.string().nullable(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.enum(["created", "authorized", "captured", "refunded", "failed"]),
});
export type RazorpayPayment = z.infer<typeof paymentSchema>;

const refundSchema = z.object({
  id: z.string().regex(/^rfnd_[A-Za-z0-9]{8,40}$/),
  payment_id: z.string(),
  amount: z.number().int(),
  status: z.enum(["pending", "processed", "failed"]),
});

/** A new order for one checkout attempt; the receipt is Razorpay's duplicate guard. */
export function createOrder(input: {
  amountMinor: number;
  receipt: string;
  notes: Record<string, string>;
}) {
  return call("POST", "/v1/orders", orderSchema, {
    amount: input.amountMinor,
    currency: "INR",
    receipt: input.receipt.slice(0, 40),
    notes: input.notes,
  });
}

export function fetchPayment(paymentId: string) {
  if (!/^pay_[A-Za-z0-9]{8,40}$/.test(paymentId)) {
    throw new AppError("VALIDATION_FAILED", "That payment reference isn't valid.");
  }
  return call("GET", `/v1/payments/${paymentId}`, paymentSchema);
}

/** Payments made against an order (to catch a missed webhook). */
export function fetchOrderPayments(orderId: string) {
  if (!/^order_[A-Za-z0-9]{8,40}$/.test(orderId)) {
    throw new AppError("VALIDATION_FAILED", "That order reference isn't valid.");
  }
  return call("GET", `/v1/orders/${orderId}/payments`, z.object({ items: z.array(paymentSchema) }));
}

/**
 * Refund part or all of a captured payment. `idempotencyKey` (our refund's id)
 * makes a retry after a timeout return the same refund instead of a second one.
 */
export function createRefund(
  paymentId: string,
  input: { amountMinor: number; idempotencyKey: string; notes: Record<string, string> },
) {
  return call(
    "POST",
    `/v1/payments/${paymentId}/refund`,
    refundSchema,
    { amount: input.amountMinor, receipt: input.idempotencyKey.slice(0, 40), notes: input.notes },
    { "X-Refund-Idempotency": input.idempotencyKey },
  );
}

export function fetchRefund(refundId: string) {
  if (!/^rfnd_[A-Za-z0-9]{8,40}$/.test(refundId)) {
    throw new AppError("VALIDATION_FAILED", "That refund reference isn't valid.");
  }
  return call("GET", `/v1/refunds/${refundId}`, refundSchema);
}

function hmacHex(secret: string, message: string | Buffer): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function sameHex(expected: string, received: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(received)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}

/** Checkout's success callback: signed with the key secret over our own order id. */
export function isValidCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  const keys = requireKeys();
  return sameHex(hmacHex(keys.keySecret, `${orderId}|${paymentId}`), signature);
}

/** Webhook deliveries: signed with the webhook secret over the raw, unparsed body. */
export function isValidWebhookSignature(rawBody: Buffer, signature: string) {
  const keys = requireKeys();
  return sameHex(hmacHex(keys.webhookSecret, rawBody), signature);
}
