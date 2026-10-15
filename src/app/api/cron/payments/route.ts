import { timingSafeEqual } from "node:crypto";

import { connection } from "next/server";

import { getPaymentsEnv } from "@/lib/env.server";
import { logger } from "@/lib/logger";
import {
  checkSentRefunds,
  reconcilePayments,
  submitPendingRefunds,
} from "@/server/payments/payments";

function authorised(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * Daily payments job (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`):
 * sends queued refunds, completes sent refunds and records payments whose
 * webhooks were missed.
 * Unpaid deposits are cancelled by pg_cron in the database, not here.
 */
export async function GET(request: Request) {
  await connection();
  if (!authorised(request.headers.get("authorization"), getPaymentsEnv().CRON_SECRET)) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }
  try {
    const refunds = await submitPendingRefunds();
    const refundChecks = await checkSentRefunds();
    const reconciled = await reconcilePayments();
    logger.info("payments.cron_done", { ...refunds, ...refundChecks, ...reconciled });
    return Response.json({ refunds, refundChecks, reconciled });
  } catch (error) {
    logger.error("payments.cron_failed", { cause: error });
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
