// A tiny stand-in for Razorpay's REST API (orders, payments, refunds) so E2E never
// calls the real service. Started by playwright.config.ts on 127.0.0.1:4010.
// Test-only helper: POST /test/pay {order_id} captures a payment and returns the
// Checkout success fields, signed like Razorpay does (HMAC-SHA256 with the key secret).
import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.FAKE_RAZORPAY_PORT ?? 4010);
const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const AUTH = `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64")}`;

const orders = new Map();
const payments = new Map();
const refunds = new Map();
const id = (prefix) => `${prefix}_${randomBytes(7).toString("hex").toUpperCase()}`;

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const error = (description) => ({ error: { code: "BAD_REQUEST_ERROR", description } });

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  try {
    if (path === "/health") return send(res, 200, { ok: true });

    if (path === "/test/pay" && req.method === "POST") {
      const { order_id: orderId } = await readJson(req);
      const order = orders.get(orderId);
      if (!order) return send(res, 400, error("The id provided does not exist"));
      const paymentId = id("pay");
      payments.set(paymentId, {
        id: paymentId,
        order_id: orderId,
        amount: order.amount,
        currency: order.currency,
        status: "captured",
      });
      order.status = "paid";
      const signature = createHmac("sha256", KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");
      return send(res, 200, {
        razorpay_payment_id: paymentId,
        razorpay_order_id: orderId,
        razorpay_signature: signature,
      });
    }
    if (path === "/test/refunds") return send(res, 200, { items: [...refunds.values()] });

    if (req.headers.authorization !== AUTH) return send(res, 401, error("Authentication failed"));

    if (path === "/v1/orders" && req.method === "POST") {
      const body = await readJson(req);
      if (!Number.isInteger(body.amount) || body.amount < 100)
        return send(res, 400, error("amount"));
      if ([...orders.values()].some((o) => o.receipt === body.receipt)) {
        return send(res, 400, error("Duplicate request"));
      }
      const order = {
        id: id("order"),
        entity: "order",
        amount: body.amount,
        currency: body.currency,
        receipt: body.receipt,
        notes: body.notes ?? {},
        status: "created",
      };
      orders.set(order.id, order);
      return send(res, 200, order);
    }
    let match = path.match(/^\/v1\/payments\/(pay_[A-Za-z0-9]+)$/);
    if (match && req.method === "GET") {
      const payment = payments.get(match[1]);
      return payment
        ? send(res, 200, payment)
        : send(res, 400, error("The id provided does not exist"));
    }
    match = path.match(/^\/v1\/orders\/(order_[A-Za-z0-9]+)\/payments$/);
    if (match && req.method === "GET") {
      return send(res, 200, {
        items: [...payments.values()].filter((p) => p.order_id === match[1]),
      });
    }
    match = path.match(/^\/v1\/payments\/(pay_[A-Za-z0-9]+)\/refund$/);
    if (match && req.method === "POST") {
      const payment = payments.get(match[1]);
      if (!payment) return send(res, 400, error("The id provided does not exist"));
      const body = await readJson(req);
      // X-Refund-Idempotency: the same key and body return the same refund.
      const key = req.headers["x-refund-idempotency"];
      if (typeof key !== "string" || key.length < 10)
        return send(res, 400, error("idempotency key"));
      const existing = [...refunds.values()].find((r) => r.idempotency_key === key);
      if (existing) {
        return existing.amount === body.amount
          ? send(res, 200, existing)
          : send(res, 409, error("Idempotency key used with different parameters"));
      }
      const refunded = [...refunds.values()]
        .filter((r) => r.payment_id === payment.id)
        .reduce((sum, r) => sum + r.amount, 0);
      if (refunded + body.amount > payment.amount)
        return send(res, 400, error("Refund exceeds payment"));
      const refund = {
        id: id("rfnd"),
        payment_id: payment.id,
        amount: body.amount,
        receipt: body.receipt,
        idempotency_key: key,
        status: "pending",
      };
      refunds.set(refund.id, refund);
      return send(res, 200, refund);
    }
    match = path.match(/^\/v1\/refunds\/(rfnd_[A-Za-z0-9]+)$/);
    if (match && req.method === "GET") {
      const refund = refunds.get(match[1]);
      return refund
        ? send(res, 200, refund)
        : send(res, 400, error("The id provided does not exist"));
    }
    return send(res, 404, error("Not found"));
  } catch (cause) {
    return send(res, 500, error(String(cause)));
  }
}).listen(PORT, "127.0.0.1");
