import "server-only";

import { z } from "zod";

import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { toAppError } from "@/lib/supabase/errors";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAccount } from "@/server/auth/session";

import {
  createOrder,
  createRefund,
  fetchOrderPayments,
  fetchPayment,
  fetchRefund,
  isValidCheckoutSignature,
  isValidWebhookSignature,
  razorpayKeys,
  type RazorpayPayment,
} from "./razorpay";
import {
  attachDepositOrder,
  claimRefunds,
  finishPaymentEvent,
  logPaymentEvent,
  paymentsToReconcile,
  recordRazorpayPayment,
  recordRazorpayRefund,
  refundsToCheck,
} from "./system-db";

/**
 * Online deposits (ADR-0005). The database decides terms, refunds and state;
 * this module talks to Razorpay and records only what Razorpay reports, through
 * a signed webhook or a server-side fetch — never from the browser alone.
 */

/** Whether online payments are configured on this deployment (keys present). */
export function paymentsConfigured(): boolean {
  return razorpayKeys() !== null;
}

/** The admin switch (public setting). */
export async function depositsRequired(): Promise<boolean> {
  const { data, error } = await createSupabasePublicClient()
    .from("platform_settings")
    .select("deposits_required")
    .maybeSingle();
  if (error) throw toAppError(error, "Could not load payment settings.");
  return data?.deposits_required ?? false;
}

export async function setDepositsRequired(required: boolean): Promise<void> {
  if (required && !paymentsConfigured()) {
    throw new AppError(
      "CONFLICT",
      "Add the Razorpay keys to this deployment before requiring deposits.",
    );
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_deposits_required", { p_required: required });
  if (error) throw toAppError(error, "Could not change the payment setting.");
}

export type DepositCheckout = {
  keyId: string;
  orderId: string;
  amountMinor: number;
  currency: "INR";
  bookingReference: string;
  /** Checkout closes itself at the deadline (Razorpay's `timeout`, in seconds). */
  secondsLeft: number;
};

/** Starts (or resumes) paying the deposit for the signed-in traveller's booking. */
export async function startDepositCheckout(bookingId: string): Promise<DepositCheckout> {
  const account = await requireAccount(["traveller"]);
  const keys = razorpayKeys();
  if (!keys)
    throw new AppError("UPSTREAM_UNAVAILABLE", "Online payments aren't available right now.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("deposit_checkout", { p_booking_id: bookingId })
    .single();
  if (error) {
    if (error.code === "55000") {
      throw new AppError("CONFLICT", "This booking has no deposit to pay now.", { cause: error });
    }
    throw toAppError(error, "Could not start the payment.");
  }
  let orderId = data.reusable_order_id;
  if (!orderId) {
    const order = await createOrder({
      amountMinor: data.amount_minor,
      receipt: `${data.booking_reference}-${data.attempt}`,
      notes: { booking_id: bookingId, booking_reference: data.booking_reference },
    });
    if (order.amount !== data.amount_minor || order.currency !== "INR") {
      throw new AppError(
        "UPSTREAM_UNAVAILABLE",
        "The payment service returned an unexpected order.",
      );
    }
    // System path, checked against the signed-in traveller: orders can't be
    // invented through the API (security review S5).
    await attachDepositOrder({
      bookingId,
      travelerId: account.id,
      orderId: order.id,
      amountMinor: data.amount_minor,
    });
    orderId = order.id;
  }
  return {
    keyId: keys.keyId,
    orderId,
    amountMinor: data.amount_minor,
    currency: "INR",
    bookingReference: data.booking_reference,
    secondsLeft: Math.max(
      60,
      Math.floor((new Date(data.payment_due_at).getTime() - Date.now()) / 1000),
    ),
  };
}

export type CheckoutOutcome = "paid" | "processing" | "refunding" | "needs_help";

/**
 * After Checkout reports success: checks the signature, then asks Razorpay for
 * the payment and records it only if Razorpay says it was captured.
 */
export async function completeDepositCheckout(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<CheckoutOutcome> {
  await requireAccount(["traveller"]);
  if (!isValidCheckoutSignature(input.orderId, input.paymentId, input.signature)) {
    logger.warn("payments.checkout_signature_invalid", {});
    throw new AppError("VALIDATION_FAILED", "We couldn't verify this payment.");
  }
  const payment = await fetchPayment(input.paymentId);
  if (payment.order_id !== input.orderId) {
    throw new AppError("VALIDATION_FAILED", "We couldn't verify this payment.");
  }
  if (payment.status !== "captured") return "processing";
  const outcome = await recordPayment(payment);
  if (outcome === "captured" || outcome === "duplicate") return "paid";
  // The booking was no longer waiting for this deposit: it's refunded in full.
  if (outcome === "refund_queued") return "refunding";
  return "needs_help";
}

async function recordPayment(payment: RazorpayPayment): Promise<string> {
  if (!payment.order_id) return "no_order";
  const recorded = await recordRazorpayPayment({
    orderId: payment.order_id,
    paymentId: payment.id,
    status: payment.status,
    amountMinor: payment.amount,
    currency: payment.currency,
  });
  if ("error" in recorded) {
    if (recorded.error.code === "22023") {
      // Never mark paid on a mismatch; this needs a person (ADR-0005 §4).
      logger.error("payments.amount_mismatch", { paymentId: payment.id });
      return "mismatch";
    }
    throw toAppError(recorded.error, "Could not record the payment.");
  }
  if (recorded.result === "unknown_order") {
    logger.warn("payments.unknown_order", { paymentId: payment.id });
  } else if (recorded.result === "extra_payment") {
    // A second payment on an already-paid order: refund it from the Dashboard (runbook).
    logger.error("payments.extra_payment", { paymentId: payment.id });
  }
  return recorded.result;
}

// --- Webhook ----------------------------------------------------------------------

const webhookSchema = z.object({
  event: z.string().max(60),
  payload: z.object({
    payment: z
      .object({
        entity: z.object({
          id: z.string(),
          order_id: z.string().nullable(),
          amount: z.number().int(),
          currency: z.string(),
          status: z.enum(["created", "authorized", "captured", "refunded", "failed"]),
        }),
      })
      .optional(),
    refund: z
      .object({
        entity: z.object({
          id: z.string(),
          payment_id: z.string(),
          amount: z.number().int(),
          status: z.enum(["pending", "processed", "failed"]),
          receipt: z.string().nullable().optional(),
        }),
      })
      .optional(),
  }),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type WebhookOutcome = { status: 200 | 400 | 401 | 503; result: string };

/**
 * Razorpay webhook: verify the signature over the raw body first, then dedupe
 * by event id, then apply. Unknown or irrelevant events are acknowledged.
 */
export async function handleRazorpayWebhook(
  rawBody: Buffer,
  signature: string | null,
  eventId: string | null,
): Promise<WebhookOutcome> {
  if (!razorpayKeys()) return { status: 503, result: "payments_not_configured" };
  if (!signature || !isValidWebhookSignature(rawBody, signature)) {
    logger.warn("payments.webhook_signature_invalid", {});
    return { status: 401, result: "invalid_signature" };
  }
  let json: unknown;
  try {
    json = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return { status: 400, result: "invalid_json" };
  }
  const parsed = webhookSchema.safeParse(json);
  if (!parsed.success) return { status: 200, result: "ignored_shape" };
  const { event, payload } = parsed.data;
  const id = eventId && eventId.length <= 100 ? eventId : null;
  if (!id) return { status: 400, result: "missing_event_id" };

  const payment = payload.payment?.entity;
  const refund = payload.refund?.entity;
  const fresh = await logPaymentEvent(id, event, {
    order_id: payment?.order_id ?? null,
    payment_id: payment?.id ?? refund?.payment_id ?? null,
    refund_id: refund?.id ?? null,
    amount: payment?.amount ?? refund?.amount ?? null,
    status: payment?.status ?? refund?.status ?? null,
  });
  if (!fresh) return { status: 200, result: "duplicate_event" };

  let result = "ignored";
  if ((event === "payment.captured" || event === "order.paid") && payment) {
    result = await recordPayment({ ...payment, status: "captured" });
  } else if (event === "payment.failed" && payment) {
    result = await recordPayment(payment);
  } else if ((event === "refund.processed" || event === "refund.failed") && refund) {
    const receipt = refund.receipt && UUID.test(refund.receipt) ? refund.receipt : null;
    result = await recordRazorpayRefund({
      refundUuid: receipt,
      razorpayRefundId: refund.id,
      razorpayPaymentId: refund.payment_id,
      amountMinor: refund.amount,
      status: event === "refund.processed" ? "processed" : "failed",
    });
    if (event === "refund.failed") logger.error("payments.refund_failed", { refundId: refund.id });
    if (
      result === "conflicting_refund" ||
      result === "amount_mismatch" ||
      result === "unknown_refund"
    ) {
      logger.error("payments.refund_needs_review", { refundId: refund.id, result });
    }
  }
  await finishPaymentEvent(id, result);
  return { status: 200, result };
}

// --- Scheduled work -----------------------------------------------------------------

/**
 * Sends queued refunds to Razorpay. Each refund is claimed by one caller before
 * sending (no double sends from concurrent runs), and its id is Razorpay's
 * idempotency key, so a retry after a timeout returns the same refund.
 * `bookingId` limits it to one booking (right after that booking is cancelled).
 */
export async function submitPendingRefunds(
  bookingId?: string,
): Promise<{ sent: number; errors: number }> {
  if (!razorpayKeys()) return { sent: 0, errors: 0 };
  let sent = 0;
  let errors = 0;
  for (const refund of await claimRefunds(bookingId)) {
    try {
      const created = await createRefund(refund.razorpay_payment_id, {
        amountMinor: refund.amount_minor,
        idempotencyKey: refund.refund_id,
        notes: { booking_reference: refund.booking_reference, refund_id: refund.refund_id },
      });
      const result = await recordRazorpayRefund({
        refundUuid: refund.refund_id,
        razorpayRefundId: created.id,
        amountMinor: created.amount,
        status: created.status === "processed" ? "processed" : "submitted",
      });
      if (result === "conflicting_refund" || result === "amount_mismatch") {
        logger.error("payments.refund_needs_review", { refundId: refund.refund_id, result });
      }
      sent += 1;
    } catch (error) {
      errors += 1;
      logger.error("payments.refund_submit_failed", {
        refundId: refund.refund_id,
        code: error instanceof AppError ? error.code : "UNKNOWN",
      });
      await recordRazorpayRefund({
        refundUuid: refund.refund_id,
        status: "error",
        error: error instanceof AppError ? error.message : "Unexpected error",
      }).catch(() => undefined);
    }
  }
  return { sent, errors };
}

/** Asks Razorpay about refunds sent but still pending after an hour (missed webhooks). */
export async function checkSentRefunds(): Promise<{ checked: number; completed: number }> {
  if (!razorpayKeys()) return { checked: 0, completed: 0 };
  let completed = 0;
  const pending = await refundsToCheck();
  for (const row of pending) {
    try {
      const refund = await fetchRefund(row.razorpay_refund_id);
      if (refund.status === "pending") continue;
      const result = await recordRazorpayRefund({
        refundUuid: row.refund_id,
        razorpayRefundId: refund.id,
        amountMinor: refund.amount,
        status: refund.status,
      });
      if (result === "processed") completed += 1;
      if (refund.status === "failed")
        logger.error("payments.refund_failed", { refundId: refund.id });
    } catch (error) {
      logger.error("payments.refund_check_failed", {
        refundId: row.refund_id,
        code: error instanceof AppError ? error.code : "UNKNOWN",
      });
    }
  }
  return { checked: pending.length, completed };
}

/** Catches missed webhooks: asks Razorpay about recent orders still unpaid here. */
export async function reconcilePayments(): Promise<{ checked: number; recorded: number }> {
  if (!razorpayKeys()) return { checked: 0, recorded: 0 };
  let recorded = 0;
  const orders = await paymentsToReconcile();
  for (const orderId of orders) {
    try {
      const { items } = await fetchOrderPayments(orderId);
      for (const payment of items.filter((p) => p.status === "captured")) {
        const result = await recordPayment(payment);
        if (result === "captured" || result === "refund_queued") {
          recorded += 1;
          logger.warn("payments.reconciled_missed_webhook", { orderId, result });
        }
      }
    } catch (error) {
      logger.error("payments.reconcile_failed", {
        orderId,
        code: error instanceof AppError ? error.code : "UNKNOWN",
      });
    }
  }
  return { checked: orders.length, recorded };
}
