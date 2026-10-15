import "server-only";

import { istDate } from "@/lib/booking-options";
import type { ExperienceCategory } from "@/lib/catalog-options";
import { AppError } from "@/lib/errors";
import { toAppError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/server/auth/session";
import type { ProviderStatus } from "@/server/providers/status";

import type { ExperienceStatus } from "./providers";

// The partner portal's data (ADR-0007): everything is read and written as the
// signed-in partner, so RLS limits it to their own business.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type MyBusiness = {
  id: string;
  slug: string;
  displayName: string;
  description: string;
  district: string | null;
  status: ProviderStatus;
  verifiedAt: string | null;
  latestReviewNote: string | null;
  legalName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

/** The partner's business (the first one, if an account somehow has several), or null. */
export async function getMyBusiness(): Promise<MyBusiness | null> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("provider_members")
    .select(
      "provider:providers(id, slug, display_name, description, district, status, verified_at, created_at)",
    )
    .eq("user_id", user.id);
  if (error) throw toAppError(error, "Could not load your business.");
  const provider = data
    .flatMap((row) => (row.provider ? [row.provider] : []))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  if (!provider) return null;

  const [details, events] = await Promise.all([
    supabase
      .from("provider_private_details")
      .select("legal_name, contact_email, contact_phone")
      .eq("provider_id", provider.id)
      .maybeSingle(),
    supabase
      .from("provider_status_events")
      .select("note")
      .eq("provider_id", provider.id)
      .not("note", "is", null)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (details.error) throw toAppError(details.error, "Could not load your business.");
  if (events.error) throw toAppError(events.error, "Could not load your business.");

  return {
    id: provider.id,
    slug: provider.slug,
    displayName: provider.display_name,
    description: provider.description,
    district: provider.district,
    status: provider.status,
    verifiedAt: provider.verified_at,
    latestReviewNote: events.data[0]?.note ?? null,
    legalName: details.data?.legal_name ?? null,
    contactEmail: details.data?.contact_email ?? null,
    contactPhone: details.data?.contact_phone ?? null,
  };
}

/** Public profile. RLS refuses it while the business is pending review or suspended. */
export async function updateBusinessProfile(
  providerId: string,
  input: { displayName: string; description: string; district: string },
): Promise<void> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("providers")
    .update({
      display_name: input.displayName,
      description: input.description,
      district: input.district || null,
    })
    .eq("id", providerId)
    .select("id");
  if (error) throw toAppError(error, "Could not save your business profile.");
  if (data.length !== 1) {
    throw new AppError(
      "CONFLICT",
      "Your profile can't be changed while it's under review or suspended.",
    );
  }
}

/** Reviewed identity details. RLS allows changes only while in draft or rejected. */
export async function updateBusinessDetails(
  providerId: string,
  input: { legalName: string; contactEmail: string; contactPhone: string },
): Promise<void> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("provider_private_details")
    .update({
      legal_name: input.legalName,
      contact_email: input.contactEmail,
      contact_phone: input.contactPhone || null,
    })
    .eq("provider_id", providerId)
    .select("provider_id");
  if (error) throw toAppError(error, "Could not save your business details.");
  if (data.length !== 1) {
    throw new AppError(
      "CONFLICT",
      "Verified details are locked. Contact Himverse to change your legal name or contact details.",
    );
  }
}

export type PartnerOverview = {
  needsResponse: number;
  soonestDeadline: string | null;
  upcomingConfirmed: number;
  revenueThisMonthMinor: number;
  liveListings: number;
  draftListings: number;
  openDates: number;
};

/** Headline numbers for the partner overview (dates and months in India time). */
export async function getPartnerOverview(providerId: string, now: Date): Promise<PartnerOverview> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const today = istDate(now);
  const in30 = istDate(now, 30);
  const monthStart = `${today.slice(0, 7)}-01`;

  const [bookings, listings, slots] = await Promise.all([
    supabase
      .from("bookings")
      .select("status, request_expires_at, slot_starts_on, confirmed_total_minor")
      .eq("provider_id", providerId)
      .or(`status.eq.requested,slot_starts_on.gte.${monthStart}`)
      .limit(2000),
    supabase
      .from("experiences")
      .select("status, accepts_bookings")
      .eq("provider_id", providerId)
      .limit(500),
    supabase
      .from("availability_slots")
      .select("id, experience:experiences!inner(provider_id)", { count: "exact", head: true })
      .eq("experience.provider_id", providerId)
      .eq("status", "open")
      .gte("starts_on", today),
  ]);
  if (bookings.error) throw toAppError(bookings.error, "Could not load your overview.");
  if (listings.error) throw toAppError(listings.error, "Could not load your overview.");
  if (slots.error) throw toAppError(slots.error, "Could not load your overview.");

  const nowIso = now.toISOString();
  const pending = bookings.data.filter(
    (b) => b.status === "requested" && b.request_expires_at > nowIso,
  );
  const soonest = pending.map((b) => b.request_expires_at).sort()[0] ?? null;
  const confirmed = bookings.data.filter(
    (b) => b.status === "confirmed" || b.status === "completed",
  );
  return {
    needsResponse: pending.length,
    soonestDeadline: soonest,
    upcomingConfirmed: confirmed.filter(
      (b) => b.status === "confirmed" && b.slot_starts_on >= today && b.slot_starts_on <= in30,
    ).length,
    revenueThisMonthMinor: confirmed
      .filter(
        (b) => b.slot_starts_on >= monthStart && b.slot_starts_on.slice(0, 7) === today.slice(0, 7),
      )
      .reduce((sum, b) => sum + (b.confirmed_total_minor ?? 0), 0),
    liveListings: listings.data.filter((e) => e.status === "published").length,
    draftListings: listings.data.filter((e) => e.status === "draft").length,
    openDates: slots.count ?? 0,
  };
}

export type MyListing = {
  id: string;
  providerId: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  category: ExperienceCategory;
  durationMinutes: number;
  priceFromMinor: number | null;
  destinationId: string;
  status: ExperienceStatus;
  acceptsBookings: boolean;
  moderationLocked: boolean;
};

/** One of the partner's listings, or null (missing or not theirs: same answer). */
export async function getMyListing(id: string): Promise<MyListing | null> {
  if (!UUID.test(id)) return null;
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("experiences")
    .select(
      "id, provider_id, slug, title, summary, description, category, duration_minutes, price_from_minor, destination_id, status, accepts_bookings, moderation_locked, provider:providers!inner(provider_members!inner(user_id))",
    )
    .eq("id", id)
    .eq("provider.provider_members.user_id", user.id)
    .maybeSingle();
  if (error) throw toAppError(error, "Could not load this listing.");
  if (!data) return null;
  return {
    id: data.id,
    providerId: data.provider_id,
    slug: data.slug,
    title: data.title,
    summary: data.summary,
    description: data.description,
    category: data.category,
    durationMinutes: data.duration_minutes,
    priceFromMinor: data.price_from_minor,
    destinationId: data.destination_id,
    status: data.status,
    acceptsBookings: data.accepts_bookings,
    moderationLocked: data.moderation_locked,
  };
}

export type ListingInput = {
  title: string;
  slug: string;
  summary: string;
  description: string;
  category: ExperienceCategory;
  durationMinutes: number;
  priceFromMinor: number | null;
  destinationId: string;
};

/** Saves a listing's details. RLS limits it to the partner's own listings. */
export async function updateListing(id: string, input: ListingInput): Promise<void> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("experiences")
    .update({
      title: input.title,
      slug: input.slug,
      summary: input.summary,
      description: input.description,
      category: input.category,
      duration_minutes: input.durationMinutes,
      price_from_minor: input.priceFromMinor,
      destination_id: input.destinationId,
    })
    .eq("id", id)
    .select("id");
  if (error) {
    if (error.code === "23505") {
      throw new AppError("VALIDATION_FAILED", "Please check the highlighted fields.", {
        cause: error,
        fieldErrors: { slug: ["That web address is already taken."] },
      });
    }
    throw toAppError(error, "Could not save this listing.");
  }
  if (data.length !== 1) throw new AppError("NOT_FOUND", "We couldn't find that listing.");
}
