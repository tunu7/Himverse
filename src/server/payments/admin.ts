import "server-only";

import { AppError } from "@/lib/errors";
import { toAppError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth/session";

import { depositsRequired, paymentsConfigured } from "./payments";

export type PartnerBalance = {
  providerId: string;
  displayName: string;
  collectedMinor: number;
  refundedMinor: number;
  pendingRefundsMinor: number;
  heldMinor: number;
  paidOutMinor: number;
  owedMinor: number;
};

export type AdminPaymentsOverview = {
  configured: boolean;
  required: boolean;
  balances: PartnerBalance[];
  openRefunds: Array<{
    id: string;
    bookingId: string;
    amountMinor: number;
    status: string;
    createdAt: string;
  }>;
  recentPayouts: Array<{
    id: string;
    providerId: string;
    amountMinor: number;
    reference: string;
    createdAt: string;
  }>;
};

/** Everything the admin Payments page shows (admin RLS and checks in each function). */
export async function getAdminPaymentsOverview(): Promise<AdminPaymentsOverview> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const [balances, refunds, payouts, required] = await Promise.all([
    supabase.rpc("admin_partner_balances"),
    supabase
      .from("refunds")
      .select("id, booking_id, amount_minor, status, created_at")
      .neq("status", "processed")
      .order("created_at", { ascending: true })
      .limit(50),
    supabase
      .from("partner_payouts")
      .select("id, provider_id, amount_minor, reference, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    depositsRequired(),
  ]);
  if (balances.error) throw toAppError(balances.error, "Could not load partner balances.");
  if (refunds.error) throw toAppError(refunds.error, "Could not load refunds.");
  if (payouts.error) throw toAppError(payouts.error, "Could not load payouts.");
  return {
    configured: paymentsConfigured(),
    required,
    balances: balances.data.map((b) => ({
      providerId: b.provider_id,
      displayName: b.display_name,
      collectedMinor: b.collected_minor,
      refundedMinor: b.refunded_minor,
      pendingRefundsMinor: b.pending_refunds_minor,
      heldMinor: b.held_minor,
      paidOutMinor: b.paid_out_minor,
      owedMinor: b.owed_minor,
    })),
    openRefunds: refunds.data.map((r) => ({
      id: r.id,
      bookingId: r.booking_id,
      amountMinor: r.amount_minor,
      status: r.status,
      createdAt: r.created_at,
    })),
    recentPayouts: payouts.data.map((p) => ({
      id: p.id,
      providerId: p.provider_id,
      amountMinor: p.amount_minor,
      reference: p.reference,
      createdAt: p.created_at,
    })),
  };
}

export async function recordPartnerPayout(input: {
  providerId: string;
  amountMinor: number;
  reference: string;
  note: string;
}): Promise<void> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_partner_payout", {
    p_provider_id: input.providerId,
    p_amount_minor: input.amountMinor,
    p_reference: input.reference,
    p_note: input.note,
  });
  if (error) {
    if (error.code === "22023") {
      throw new AppError("VALIDATION_FAILED", "The payout can't be more than the amount owed.", {
        cause: error,
        fieldErrors: { amountRupees: ["More than the amount owed."] },
      });
    }
    if (error.code === "23505") {
      throw new AppError("CONFLICT", "This bank reference is already recorded.", {
        cause: error,
        fieldErrors: { reference: ["Already recorded."] },
      });
    }
    throw toAppError(error, "Could not record the payout.");
  }
}

/** The partner's own deposit summary (members of the business only). */
export async function getPartnerPaymentSummary(providerId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("partner_payment_summary", { p_provider_id: providerId })
    .single();
  if (error) throw toAppError(error, "Could not load your payments.");
  return {
    collectedMinor: data.collected_minor,
    refundedMinor: data.refunded_minor,
    pendingRefundsMinor: data.pending_refunds_minor,
    heldMinor: data.held_minor,
    paidOutMinor: data.paid_out_minor,
    owedMinor: data.owed_minor,
  };
}
