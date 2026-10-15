import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const KEY_SECRET = "test_key_secret_123";
const WEBHOOK_SECRET = "test_webhook_secret_456";
const env = {
  RAZORPAY_KEY_ID: "rzp_test_ABCDEFGH12" as string | undefined,
  RAZORPAY_KEY_SECRET: KEY_SECRET as string | undefined,
  RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET as string | undefined,
  RAZORPAY_API_BASE: "http://127.0.0.1:4010",
  RAZORPAY_ALLOW_LIVE: "false",
  CRON_SECRET: undefined,
};
vi.mock("@/lib/env.server", () => ({ getPaymentsEnv: () => env }));

const system = {
  logPaymentEvent: vi.fn(async () => true),
  finishPaymentEvent: vi.fn(async () => undefined),
  recordRazorpayPayment: vi.fn(
    async (): Promise<{ result: string } | { error: { code: string } }> => ({
      result: "captured",
    }),
  ),
  recordRazorpayRefund: vi.fn(async () => "processed"),
  claimRefunds: vi.fn(
    async (): Promise<
      Array<{
        refund_id: string;
        razorpay_payment_id: string;
        amount_minor: number;
        booking_reference: string;
      }>
    > => [],
  ),
  refundsToCheck: vi.fn(async () => []),
  attachDepositOrder: vi.fn(async () => undefined),
  paymentsToReconcile: vi.fn(async () => []),
};
vi.mock("@/server/payments/system-db", () => system);
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/supabase/public", () => ({ createSupabasePublicClient: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ requireAccount: vi.fn() }));

const { isValidCheckoutSignature, isValidWebhookSignature } =
  await import("@/server/payments/razorpay");
const { handleRazorpayWebhook, submitPendingRefunds } = await import("@/server/payments/payments");
const { parsePaymentsEnv } = await import("@/lib/env");
const { payoutSchema } = await import("@/features/admin/schemas");
const { depositResultSchema } = await import("@/features/bookings/schemas");

const hmac = (secret: string, message: string) =>
  createHmac("sha256", secret).update(message).digest("hex");

function webhook(
  body: object,
  { secret = WEBHOOK_SECRET, eventId = "evt_1" as string | null } = {},
) {
  const raw = Buffer.from(JSON.stringify(body));
  return handleRazorpayWebhook(raw, hmac(secret, raw.toString()), eventId);
}

const captured = {
  event: "payment.captured",
  payload: {
    payment: {
      entity: {
        id: "pay_ABCDEFGH1234",
        order_id: "order_ABCDEFGH1234",
        amount: 100001,
        currency: "INR",
        status: "captured",
        email: "someone@example.test",
      },
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  env.RAZORPAY_KEY_ID = "rzp_test_ABCDEFGH12";
});

describe("signatures", () => {
  it("accepts Checkout's signature over our order id and the payment id", () => {
    const sig = hmac(KEY_SECRET, "order_ABCDEFGH1234|pay_ABCDEFGH1234");
    expect(isValidCheckoutSignature("order_ABCDEFGH1234", "pay_ABCDEFGH1234", sig)).toBe(true);
    // Swapped order, wrong secret, malformed.
    expect(isValidCheckoutSignature("order_OTHER0001234", "pay_ABCDEFGH1234", sig)).toBe(false);
    expect(
      isValidCheckoutSignature(
        "order_ABCDEFGH1234",
        "pay_ABCDEFGH1234",
        hmac("wrong", "order_ABCDEFGH1234|pay_ABCDEFGH1234"),
      ),
    ).toBe(false);
    expect(isValidCheckoutSignature("order_ABCDEFGH1234", "pay_ABCDEFGH1234", "zz")).toBe(false);
  });

  it("checks webhooks over the exact raw bytes", () => {
    const raw = Buffer.from('{"event":"payment.captured"}');
    const sig = hmac(WEBHOOK_SECRET, raw.toString());
    expect(isValidWebhookSignature(raw, sig)).toBe(true);
    expect(isValidWebhookSignature(Buffer.from('{"event": "payment.captured"}'), sig)).toBe(false);
    expect(isValidWebhookSignature(raw, sig.toUpperCase())).toBe(false);
  });
});

describe("webhook handler", () => {
  it("rejects bad signatures before reading anything", async () => {
    expect(await webhook(captured, { secret: "attacker" })).toEqual({
      status: 401,
      result: "invalid_signature",
    });
    expect(system.logPaymentEvent).not.toHaveBeenCalled();
    expect(system.recordRazorpayPayment).not.toHaveBeenCalled();
  });

  it("is off when payments aren't configured", async () => {
    env.RAZORPAY_KEY_ID = undefined;
    expect((await webhook(captured)).status).toBe(503);
  });

  it("needs Razorpay's event id to deduplicate", async () => {
    expect((await webhook(captured, { eventId: null })).status).toBe(400);
  });

  it("records a capture with the amount and currency Razorpay reports, keeping no payer details", async () => {
    expect(await webhook(captured)).toEqual({ status: 200, result: "captured" });
    expect(system.recordRazorpayPayment).toHaveBeenCalledWith({
      orderId: "order_ABCDEFGH1234",
      paymentId: "pay_ABCDEFGH1234",
      status: "captured",
      amountMinor: 100001,
      currency: "INR",
    });
    const summary = JSON.stringify(system.logPaymentEvent.mock.calls[0]);
    expect(summary).not.toContain("someone@example.test");
    expect(system.finishPaymentEvent).toHaveBeenCalledWith("evt_1", "captured");
  });

  it("acknowledges repeated deliveries without applying them twice", async () => {
    system.logPaymentEvent.mockResolvedValueOnce(false);
    expect(await webhook(captured)).toEqual({ status: 200, result: "duplicate_event" });
    expect(system.recordRazorpayPayment).not.toHaveBeenCalled();
  });

  it("never marks paid on an amount mismatch, and doesn't make Razorpay retry", async () => {
    system.recordRazorpayPayment.mockResolvedValueOnce({ error: { code: "22023" } });
    expect(await webhook(captured)).toEqual({ status: 200, result: "mismatch" });
  });

  it("completes a refund by our receipt (the refund's own id)", async () => {
    const receipt = "3f6c1d2e-8a4b-4c5d-9e6f-0a1b2c3d4e5f";
    await webhook({
      event: "refund.processed",
      payload: {
        refund: {
          entity: {
            id: "rfnd_ABCDEFGH1234",
            payment_id: "pay_ABCDEFGH1234",
            amount: 50000,
            status: "processed",
            receipt,
          },
        },
      },
    });
    expect(system.recordRazorpayRefund).toHaveBeenCalledWith({
      refundUuid: receipt,
      razorpayRefundId: "rfnd_ABCDEFGH1234",
      razorpayPaymentId: "pay_ABCDEFGH1234",
      amountMinor: 50000,
      status: "processed",
    });
  });

  it("acknowledges events it doesn't use", async () => {
    expect(await webhook({ event: "settlement.processed", payload: {} })).toEqual({
      status: 200,
      result: "ignored",
    });
  });
});

describe("sending refunds", () => {
  it("sends only claimed refunds, with our refund id as Razorpay's idempotency key", async () => {
    const refundId = "3f6c1d2e-8a4b-4c5d-9e6f-0a1b2c3d4e5f";
    system.claimRefunds.mockResolvedValueOnce([
      {
        refund_id: refundId,
        razorpay_payment_id: "pay_ABCDEFGH1234",
        amount_minor: 50000,
        booking_reference: "HV-ABC123",
      },
    ]);
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({
        id: "rfnd_ABCDEFGH1234",
        payment_id: "pay_ABCDEFGH1234",
        amount: 50000,
        status: "pending",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect(await submitPendingRefunds("booking-1")).toEqual({ sent: 1, errors: 0 });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(system.claimRefunds).toHaveBeenCalledWith("booking-1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:4010/v1/payments/pay_ABCDEFGH1234/refund");
    expect((init.headers as Record<string, string>)["X-Refund-Idempotency"]).toBe(refundId);
    expect(JSON.parse(String(init.body))).toMatchObject({ amount: 50000 });
    expect(system.recordRazorpayRefund).toHaveBeenCalledWith({
      refundUuid: refundId,
      razorpayRefundId: "rfnd_ABCDEFGH1234",
      amountMinor: 50000,
      status: "submitted",
    });
  });

  it("records an error (for a later retry with the same key) when Razorpay doesn't answer", async () => {
    system.claimRefunds.mockResolvedValueOnce([
      {
        refund_id: "3f6c1d2e-8a4b-4c5d-9e6f-0a1b2c3d4e5f",
        razorpay_payment_id: "pay_ABCDEFGH1234",
        amount_minor: 50000,
        booking_reference: "HV-ABC123",
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("timeout"))),
    );
    try {
      expect(await submitPendingRefunds()).toEqual({ sent: 0, errors: 1 });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(system.recordRazorpayRefund).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error" }),
    );
  });
});

describe("inputs and settings", () => {
  it("parses payouts in rupees to paise and refuses nonsense", () => {
    const base = { providerId: "3f6c1d2e-8a4b-4c5d-9e6f-0a1b2c3d4e5f", reference: "UTR1" };
    expect(payoutSchema.parse({ ...base, amountRupees: "1500.50" }).amountRupees).toBe(150050);
    for (const amountRupees of ["0", "-5", "1e3", "12.345", "abc"]) {
      expect(payoutSchema.safeParse({ ...base, amountRupees }).success).toBe(false);
    }
  });

  it("accepts only Razorpay-shaped checkout results", () => {
    const good = {
      orderId: "order_ABCDEFGH1234",
      paymentId: "pay_ABCDEFGH1234",
      signature: "a".repeat(64),
    };
    expect(depositResultSchema.safeParse(good).success).toBe(true);
    expect(depositResultSchema.safeParse({ ...good, orderId: "order_1;drop" }).success).toBe(false);
    expect(depositResultSchema.safeParse({ ...good, amount: 1 }).success).toBe(false);
  });

  it("refuses live keys until the go-live gate, and half-configured keys", () => {
    const keys = {
      RAZORPAY_KEY_ID: "rzp_live_ABCDEFGH12",
      RAZORPAY_KEY_SECRET: "x".repeat(20),
      RAZORPAY_WEBHOOK_SECRET: "y".repeat(20),
    };
    expect(() => parsePaymentsEnv(keys)).toThrow(/RAZORPAY_KEY_ID/);
    expect(parsePaymentsEnv({ ...keys, RAZORPAY_ALLOW_LIVE: "true" }).RAZORPAY_KEY_ID).toBe(
      "rzp_live_ABCDEFGH12",
    );
    expect(() =>
      parsePaymentsEnv({
        RAZORPAY_KEY_ID: "rzp_test_ABCDEFGH12",
        RAZORPAY_KEY_SECRET: "x".repeat(20),
      }),
    ).toThrow(/RAZORPAY_KEY_ID/);
    expect(parsePaymentsEnv({}).RAZORPAY_KEY_ID).toBeUndefined();
  });

  it("sends keys only to Razorpay itself on Vercel", () => {
    expect(() =>
      parsePaymentsEnv({ VERCEL_ENV: "production", RAZORPAY_API_BASE: "https://evil.example" }),
    ).toThrow(/RAZORPAY_API_BASE/);
    expect(parsePaymentsEnv({ VERCEL_ENV: "production" }).RAZORPAY_API_BASE).toBe(
      "https://api.razorpay.com",
    );
    expect(parsePaymentsEnv({ RAZORPAY_API_BASE: "http://127.0.0.1:4010" }).RAZORPAY_API_BASE).toBe(
      "http://127.0.0.1:4010",
    );
  });
});
