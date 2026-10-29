import { createHmac, randomUUID } from "node:crypto";

import { expect, type Page, test } from "@playwright/test";

import { FAKE_RAZORPAY_PORT, RAZORPAY_TEST_KEYS } from "../../playwright.config";
import {
  currentUserId,
  localSql,
  setUpTwoStep,
  signIn,
  signUp,
  uniqueEmail,
  UUID,
} from "./support";

// Online deposits (ADR-0005) end to end against a fake Razorpay API: the admin
// switch, partner confirmation → 50% deposit, Checkout → server verification,
// webhooks (signed, deduplicated), cancellation refund, and the admin balance.

const DEMO_PROVIDER = "5eed0000-0000-4000-8000-0000000000a1"; // owns Siang rafting
const FAKE = `http://127.0.0.1:${FAKE_RAZORPAY_PORT}`;

function istDatePlus(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function postWebhook(
  page: Page,
  body: object,
  secret = RAZORPAY_TEST_KEYS.RAZORPAY_WEBHOOK_SECRET,
) {
  const raw = JSON.stringify(body);
  return page.request.post("/api/webhooks/razorpay", {
    data: raw,
    headers: {
      "content-type": "application/json",
      "x-razorpay-signature": createHmac("sha256", secret).update(raw).digest("hex"),
      "x-razorpay-event-id": `evt_${randomUUID()}`,
    },
  });
}

/** Stands in for Razorpay Checkout: "pays" through the fake API and calls the handler. */
async function fakeCheckout(page: Page) {
  await page.route("https://checkout.razorpay.com/v1/checkout.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.Razorpay = function (options) {
        this.on = function () {};
        this.open = function () {
          fetch("https://api.razorpay.com/e2e-pay?order_id=" + options.order_id)
            .then(function (r) { return r.json(); })
            .then(function (result) { options.handler(result); });
        };
      };`,
    }),
  );
  await page.route("https://api.razorpay.com/e2e-pay**", async (route) => {
    const orderId = new URL(route.request().url()).searchParams.get("order_id");
    const paid = await fetch(`${FAKE}/test/pay`, {
      method: "POST",
      body: JSON.stringify({ order_id: orderId }),
    });
    await route.fulfill({ contentType: "application/json", body: await paid.text() });
  });
}

let adminId: string | undefined;

test.afterAll(() => {
  // Other specs confirm bookings without deposits.
  localSql("update public.platform_settings set deposits_required = false where id returning id");
  if (adminId && UUID.test(adminId)) {
    localSql(`delete from public.user_roles where user_id = '${adminId}' returning user_id`);
  }
});

test("deposit: required by admin, paid via Checkout, verified, refunded on cancellation", async ({
  page,
}) => {
  test.setTimeout(240_000);

  // An admin turns deposits on.
  const adminEmail = uniqueEmail("pay-admin");
  await signUp(page, adminEmail, "Pay Admin");
  adminId = await currentUserId(page);
  localSql(
    `insert into public.user_roles (user_id, role, granted_by) values ('${adminId}', 'admin', null) returning user_id`,
  );
  await page.goto("/admin/payments");
  await setUpTwoStep(page, adminEmail, /\/admin\/payments$/);
  await expect(page.getByTestId("deposits-state").filter({ visible: true })).toContainText("Off");
  await page.getByRole("button", { name: "Require deposits" }).click();
  await expect(page.getByTestId("deposits-state").filter({ visible: true })).toContainText("On");

  // A partner of the rafting provider, and a traveller who books a date 40 days ahead.
  const partnerEmail = uniqueEmail("pay-host");
  await signUp(page, partnerEmail, "Pay Host", "partner");
  const partnerId = await currentUserId(page, "partner");
  localSql(
    `insert into public.provider_members (provider_id, user_id) values ('${DEMO_PROVIDER}', '${partnerId}') returning user_id`,
  );
  const travellerEmail = uniqueEmail("pay-guest");
  await signUp(page, travellerEmail, "Pay Guest");
  await page.goto("/experiences/demo-siang-rafting");
  await page.getByLabel("Date").selectOption(istDatePlus(40));
  await page.getByLabel("Adults").fill("1");
  await page.getByLabel(/Contact phone/).fill("+91 98765 43210");
  await page.getByRole("button", { name: "Book now" }).click();
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/);
  const bookingUrl = page.url();

  // Confirmed instantly at the listed price; a 50% deposit is due within the hour.
  await expect(page.getByTestId("booking-status").filter({ visible: true })).toHaveText(
    "Confirmed",
  );
  await expect(page.getByRole("button", { name: /^Pay ₹[\d,]+ deposit$/ })).toBeVisible();
  await signIn(page, partnerEmail, "partner");
  await page.goto(bookingUrl.replace("/bookings/", "/provider/bookings/"));
  await expect(page.getByTestId("deposit-status").filter({ visible: true })).toContainText(
    "Waiting for the traveller",
  );

  // The traveller pays through (fake) Checkout; the server verifies with "Razorpay".
  await signIn(page, travellerEmail);
  await page.goto("/bookings");
  await expect(page.getByTestId("deposit-due").filter({ visible: true })).toBeVisible();
  await fakeCheckout(page);
  await page.goto(bookingUrl);
  await page.getByRole("button", { name: /^Pay ₹[\d,]+ deposit$/ }).click();
  // The page refreshes from the server after verification.
  await expect(page.getByTestId("deposit-status").filter({ visible: true })).toContainText(
    /deposit paid/i,
  );
  await page.reload();
  await expect(page.getByTestId("deposit-status").filter({ visible: true })).toContainText(
    "deposit paid online",
  );

  // Webhooks: forged signatures are refused; a late duplicate capture changes nothing.
  const bookingId = bookingUrl.split("/").at(-1);
  expect(UUID.test(bookingId ?? "")).toBe(true);
  const [payment] = localSql(
    `select razorpay_order_id, razorpay_payment_id, amount_minor from public.payments where booking_id = '${bookingId}' and status = 'captured'`,
  ) as Array<{ razorpay_order_id: string; razorpay_payment_id: string; amount_minor: number }>;
  expect(payment).toBeTruthy();
  const capturedEvent = {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: payment!.razorpay_payment_id,
          order_id: payment!.razorpay_order_id,
          amount: payment!.amount_minor,
          currency: "INR",
          status: "captured",
        },
      },
    },
  };
  expect((await postWebhook(page, capturedEvent, "forged-secret")).status()).toBe(401);
  const duplicate = await postWebhook(page, capturedEvent);
  expect(duplicate.status()).toBe(200);
  expect(await duplicate.json()).toEqual({ result: "duplicate" });

  // Cancelling 40 days ahead refunds the whole deposit; Razorpay later confirms it.
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByTestId("refund-status").filter({ visible: true })).toContainText(
    "being processed",
  );
  const refunds = (await (await fetch(`${FAKE}/test/refunds`)).json()) as {
    items: Array<{ id: string; payment_id: string; amount: number; receipt: string }>;
  };
  const refund = refunds.items.find((r) => r.payment_id === payment!.razorpay_payment_id);
  expect(refund?.amount).toBe(payment!.amount_minor);
  const processed = await postWebhook(page, {
    event: "refund.processed",
    payload: { refund: { entity: { ...refund, status: "processed" } } },
  });
  expect(await processed.json()).toEqual({ result: "processed" });
  await page.reload();
  await expect(page.getByTestId("refund-status").filter({ visible: true })).toContainText("sent");
});
