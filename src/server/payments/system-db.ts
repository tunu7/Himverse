import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getPublicEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";
import { toAppError } from "@/lib/supabase/errors";
import type { Database } from "@/types/database";

/**
 * The payment system path (ADR-0005 §8): Razorpay webhooks, the scheduled job
 * and server-checked checkout results, where no user is acting. The Supabase
 * secret key bypasses RLS and every grant, so the protection is this module's
 * shape: it is server-only and only calls the payment functions below (no
 * table reads or writes). Don't add anything else here.
 */
function systemClient() {
  return createClient<Database>(
    getPublicEnv().NEXT_PUBLIC_SUPABASE_URL,
    getServerEnv().SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}

export type DatabaseErrorLike = { code?: string | null; message?: string | null };

/** Records the order the server just created, for the signed-in traveller's booking. */
export async function attachDepositOrder(input: {
  bookingId: string;
  travelerId: string;
  orderId: string;
  amountMinor: number;
}): Promise<void> {
  const { error } = await systemClient().rpc("attach_deposit_order", {
    p_booking_id: input.bookingId,
    p_traveler_id: input.travelerId,
    p_order_id: input.orderId,
    p_amount_minor: input.amountMinor,
  });
  if (error) throw toAppError(error, "Could not start the payment.");
}

/** What Razorpay reports about a payment; returns the database's outcome. */
export async function recordRazorpayPayment(input: {
  orderId: string;
  paymentId: string;
  status: string;
  amountMinor: number;
  currency: string;
}): Promise<{ result: string } | { error: DatabaseErrorLike }> {
  const { data, error } = await systemClient().rpc("record_razorpay_payment", {
    p_order_id: input.orderId,
    p_payment_id: input.paymentId,
    p_status: input.status,
    p_amount_minor: input.amountMinor,
    p_currency: input.currency,
  });
  return error ? { error } : { result: data };
}

export async function recordRazorpayRefund(input: {
  status: "submitted" | "processed" | "failed" | "error";
  refundUuid?: string | null;
  razorpayRefundId?: string | null;
  razorpayPaymentId?: string | null;
  amountMinor?: number | null;
  error?: string;
}): Promise<string> {
  const { data, error } = await systemClient().rpc("record_razorpay_refund", {
    p_status: input.status,
    p_refund_uuid: input.refundUuid ?? undefined,
    p_razorpay_refund_id: input.razorpayRefundId ?? undefined,
    p_razorpay_payment_id: input.razorpayPaymentId ?? undefined,
    p_amount_minor: input.amountMinor ?? undefined,
    p_error: input.error,
  });
  if (error) throw toAppError(error, "Could not record the refund.");
  return data;
}

/** Claims refunds to send (each claimed by one caller for 5 minutes). */
export async function claimRefunds(bookingId?: string) {
  const { data, error } = await systemClient().rpc("claim_refunds", {
    p_limit: 20,
    p_booking_id: bookingId,
  });
  if (error) throw toAppError(error, "Could not load refunds to send.");
  return data;
}

/** Sent refunds still pending after an hour (to ask Razorpay about). */
export async function refundsToCheck() {
  const { data, error } = await systemClient().rpc("refunds_to_check", { p_limit: 50 });
  if (error) throw toAppError(error, "Could not load refunds to check.");
  return data;
}

export async function paymentsToReconcile() {
  const { data, error } = await systemClient().rpc("payments_to_reconcile", { p_limit: 50 });
  if (error) throw toAppError(error, "Could not load payments to check.");
  return data.map((row) => row.razorpay_order_id);
}

/** True when this delivery should be processed (new, or a retry of an unfinished one). */
export async function logPaymentEvent(
  eventId: string,
  eventType: string,
  summary: Record<string, unknown>,
) {
  const { data, error } = await systemClient().rpc("log_payment_event", {
    p_event_id: eventId,
    p_event_type: eventType,
    p_summary: summary as Database["public"]["Functions"]["log_payment_event"]["Args"]["p_summary"],
  });
  if (error) throw toAppError(error, "Could not log the payment event.");
  return data;
}

export async function finishPaymentEvent(eventId: string, result: string) {
  const { error } = await systemClient().rpc("finish_payment_event", {
    p_event_id: eventId,
    p_result: result,
  });
  if (error) throw toAppError(error, "Could not log the payment event.");
}
