import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { cardClass } from "@/components/form-feedback";
import { LoadingBlock, PageShell } from "@/components/page-shell";
import { EmptyState } from "@/components/ui";
import { DepositsSwitch, PayoutForm } from "@/features/admin/components/payment-forms";
import { formatPriceFrom } from "@/lib/format";
import { requireAdminForPage } from "@/server/auth/session";
import { getAdminPaymentsOverview } from "@/server/payments/admin";

export const metadata: Metadata = { title: "Payments · Admin", robots: { index: false } };

const rupees = (minor: number) => formatPriceFrom(minor) ?? "₹0";

async function Payments() {
  await requireAdminForPage("/admin/payments");
  await connection();
  const overview = await getAdminPaymentsOverview();

  return (
    <div className="flex flex-col gap-8">
      <section className={`${cardClass} flex flex-col gap-3 p-6`} aria-labelledby="switch-heading">
        <h2 id="switch-heading" className="text-lg font-semibold">
          Online deposits
        </h2>
        <p className="text-sm text-fg-soft" data-testid="deposits-state">
          {overview.required
            ? "On: travellers pay a 50% deposit within 24 hours of a partner confirming, or the booking is cancelled."
            : "Off: bookings are confirmed without any online payment."}
        </p>
        {overview.required && !overview.configured ? (
          <p role="alert" className="text-sm font-medium text-danger">
            Deposits are required but the Razorpay keys are missing: travellers can&apos;t pay and
            unpaid bookings will be cancelled. Add the keys or stop requiring deposits now.
          </p>
        ) : null}
        {!overview.configured ? (
          <p className="text-sm text-warning-soft-fg">
            Razorpay keys aren&apos;t set on this deployment, so deposits can&apos;t be turned on
            yet (see docs/operations/PAYMENTS.md).
          </p>
        ) : null}
        <DepositsSwitch required={overview.required} configured={overview.configured} />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="balances-heading">
        <h2 id="balances-heading" className="text-lg font-semibold">
          Owed to partners
        </h2>
        <p className="text-sm text-muted">
          Deposits are collected by Himverse. Pay each partner by bank transfer, then record it
          here. Owed = collected − refunds (sent or pending) − payouts.
        </p>
        {overview.balances.length === 0 ? (
          <EmptyState title="No deposits collected yet.">
            <p>Partner balances appear after the first deposit is paid.</p>
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {overview.balances.map((b) => (
              <li
                key={b.providerId}
                data-testid="partner-balance"
                className={`${cardClass} flex flex-col gap-3 p-5`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{b.displayName}</p>
                  <p className="font-semibold" data-testid="partner-owed">
                    Owed {rupees(b.owedMinor)}
                  </p>
                </div>
                <p className="text-sm text-muted">
                  Collected {rupees(b.collectedMinor)} · refunded {rupees(b.refundedMinor)}
                  {b.pendingRefundsMinor > 0
                    ? ` · refunds pending ${rupees(b.pendingRefundsMinor)}`
                    : ""}{" "}
                  · paid out {rupees(b.paidOutMinor)}
                </p>
                {b.owedMinor > 0 ? (
                  <PayoutForm providerId={b.providerId} name={b.displayName} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="refunds-heading">
        <h2 id="refunds-heading" className="text-lg font-semibold">
          Refunds not yet completed
        </h2>
        {overview.openRefunds.length === 0 ? (
          <p className="text-sm text-muted">None. All refunds have been processed.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {overview.openRefunds.map((r) => (
              <li key={r.id} className={`${cardClass} flex flex-wrap justify-between gap-2 p-4`}>
                <span>
                  {rupees(r.amountMinor)} · booking <code className="text-xs">{r.bookingId}</code>
                </span>
                <span className={r.status === "failed" ? "font-medium text-danger" : "text-muted"}>
                  {r.status === "failed"
                    ? "Failed at Razorpay: refund manually from the Razorpay dashboard"
                    : "Pending (sent automatically; retried daily)"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {overview.recentPayouts.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="payouts-heading">
          <h2 id="payouts-heading" className="text-lg font-semibold">
            Recent payouts
          </h2>
          <ul className="flex flex-col gap-1 text-sm text-muted">
            {overview.recentPayouts.map((p) => {
              const name =
                overview.balances.find((b) => b.providerId === p.providerId)?.displayName ??
                "Partner";
              return (
                <li key={p.id}>
                  {new Date(p.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}{" "}
                  · {name} · {rupees(p.amountMinor)} · ref {p.reference}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export default function AdminPaymentsPage() {
  return (
    <PageShell
      title="Payments"
      description="Online deposits, refunds and what Himverse owes each partner."
    >
      <Suspense fallback={<LoadingBlock label="Loading payments…" variant="list" />}>
        <Payments />
      </Suspense>
    </PageShell>
  );
}
