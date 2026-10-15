"use client";

import { useCallback, useEffect, useState } from "react";

import { buttonClass } from "@/components/form-feedback";
import { formatPriceFrom } from "@/lib/format";

import { completeDepositCheckoutAction, startDepositCheckoutAction } from "../actions";

const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpaySuccess = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};
type RazorpayInstance = {
  open: () => void;
  on: (
    event: "payment.failed",
    handler: (response: { error?: { description?: string } }) => void,
  ) => void;
};
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

/** Loads Razorpay Checkout once, only when the traveller chooses to pay. */
function loadCheckout(): Promise<RazorpayConstructor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () =>
      window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Checkout unavailable"));
    script.onerror = () => reject(new Error("Checkout unavailable"));
    document.head.appendChild(script);
  });
}

type State =
  | { step: "idle" }
  | { step: "busy"; label: string }
  | { step: "paid" }
  | { step: "processing" }
  | { step: "refunding" }
  | { step: "needs_help" }
  | { step: "error"; message: string };

/**
 * Checkout is allowed only by the booking page's own security policy. After an
 * in-app navigation the browser may still apply another page's policy, so if
 * the script is blocked we reload this page once (a fresh policy) and resume.
 */
const RESUME_KEY = "himverse-resume-deposit";

function rememberResume(bookingId: string): boolean {
  try {
    if (sessionStorage.getItem(RESUME_KEY) === bookingId) return false;
    sessionStorage.setItem(RESUME_KEY, bookingId);
    return true;
  } catch {
    return false;
  }
}

function takeResume(bookingId: string): boolean {
  try {
    if (sessionStorage.getItem(RESUME_KEY) !== bookingId) return false;
    sessionStorage.removeItem(RESUME_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * "Pay deposit" (ADR-0005): the server creates the Razorpay order; Checkout
 * collects the payment; the server verifies it with Razorpay before the
 * booking shows as paid. Nothing here decides that a payment succeeded.
 */
export function PayDeposit({
  bookingId,
  amountMinor,
  dueLabel,
}: {
  bookingId: string;
  amountMinor: number;
  dueLabel: string;
}) {
  const [state, setState] = useState<State>({ step: "idle" });
  const amount = formatPriceFrom(amountMinor) ?? "";

  const pay = useCallback(async () => {
    setState({ step: "busy", label: "Opening secure payment…" });
    const started = await startDepositCheckoutAction({ bookingId });
    if (!started.ok) {
      setState({ step: "error", message: started.error.message });
      return;
    }
    const checkout = started.data;
    let Razorpay: RazorpayConstructor;
    try {
      Razorpay = await loadCheckout();
    } catch {
      if (rememberResume(bookingId)) {
        window.location.reload();
        return;
      }
      setState({
        step: "error",
        message: "The payment window couldn't load. Check your connection and try again.",
      });
      return;
    }
    const instance = new Razorpay({
      key: checkout.keyId,
      amount: checkout.amountMinor,
      currency: checkout.currency,
      order_id: checkout.orderId,
      name: "Himverse.AI",
      description: `Deposit for booking ${checkout.bookingReference}`,
      // Close Checkout at the payment deadline.
      timeout: checkout.secondsLeft,
      handler: async (response: RazorpaySuccess) => {
        setState({ step: "busy", label: "Confirming your payment…" });
        // Our own order id, not the one echoed by Checkout (Razorpay's guidance).
        const result = await completeDepositCheckoutAction({
          orderId: checkout.orderId,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        });
        if (!result.ok) setState({ step: "error", message: result.error.message });
        else setState({ step: result.data.status });
      },
      modal: { ondismiss: () => setState((s) => (s.step === "busy" ? { step: "idle" } : s)) },
      theme: { color: "#0b7a5c" },
    });
    instance.on("payment.failed", (response) =>
      setState({
        step: "error",
        message: response.error?.description
          ? `Payment failed: ${response.error.description}`
          : "The payment didn't go through. You can try again.",
      }),
    );
    instance.open();
  }, [bookingId]);

  // Resume after the one-time reload for the page's payment security policy.
  useEffect(() => {
    if (!takeResume(bookingId)) return;
    const timer = window.setTimeout(() => void pay(), 0);
    return () => window.clearTimeout(timer);
  }, [bookingId, pay]);

  if (state.step === "paid") {
    return (
      <p role="status" className="font-medium text-accent" data-testid="deposit-status">
        Deposit paid. Thank you — your booking is secured.
      </p>
    );
  }
  if (state.step === "refunding") {
    return (
      <p role="status" className="text-sm text-fg-soft" data-testid="deposit-status">
        This booking was no longer waiting for a deposit, so your payment will be refunded in full
        (usually 5–7 working days).
      </p>
    );
  }
  if (state.step === "needs_help") {
    return (
      <p role="status" className="text-sm text-warning-soft-fg" data-testid="deposit-status">
        We received a payment we couldn&apos;t match to this deposit. Himverse will check it and
        refund it if needed; you don&apos;t need to pay again.
      </p>
    );
  }
  if (state.step === "processing") {
    return (
      <p role="status" className="text-sm text-fg-soft" data-testid="deposit-status">
        Payment received by Razorpay and being confirmed. This page will show it as paid within a
        few minutes.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={pay}
        disabled={state.step === "busy"}
        className={`${buttonClass} self-start`}
      >
        {state.step === "busy" ? state.label : `Pay ${amount} deposit`}
      </button>
      <p className="text-xs text-subtle">
        Pay by {dueLabel} to keep this booking; unpaid bookings are cancelled automatically. Secure
        payment by Razorpay (UPI, cards, netbanking).
      </p>
      {state.step === "error" ? (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
