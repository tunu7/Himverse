import { connection } from "next/server";

import { logger } from "@/lib/logger";
import { handleRazorpayWebhook } from "@/server/payments/payments";

/** Razorpay events are small; anything larger isn't a genuine delivery. */
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Razorpay webhook (ADR-0005). No session: authenticity comes only from the
 * HMAC signature over the raw body, checked before anything is parsed.
 * Responds 2xx once an event is stored or recognised as a duplicate, so
 * Razorpay stops retrying; 5xx makes it retry later.
 */
export async function POST(request: Request) {
  await connection();
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.byteLength > MAX_BODY_BYTES)
    return Response.json({ error: "too_large" }, { status: 413 });
  try {
    const outcome = await handleRazorpayWebhook(
      raw,
      request.headers.get("x-razorpay-signature"),
      request.headers.get("x-razorpay-event-id"),
    );
    return Response.json({ result: outcome.result }, { status: outcome.status });
  } catch (error) {
    logger.error("payments.webhook_failed", { cause: error });
    return Response.json({ error: "temporarily_unavailable" }, { status: 503 });
  }
}
