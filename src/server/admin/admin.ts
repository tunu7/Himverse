import "server-only";

import type { BookingStatus } from "@/lib/booking-options";
import { AppError } from "@/lib/errors";
import { toAppError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth/session";
import type { ProviderStatus } from "@/server/providers/status";
import type { Database } from "@/types/database";

// Admin console data access. Every function re-checks the admin role and runs as
// the signed-in admin, so RLS ("admins read all …", admin-only destination and
// experience writes, the moderation-lock trigger) remains the authority.

type ExperienceStatus = Database["public"]["Enums"]["experience_status"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export type AdminOverview = {
  providersAwaitingReview: number;
  providersVerified: number;
  experiencesPublished: number;
  experiencesLocked: number;
  destinationsPublished: number;
  destinationsTotal: number;
  bookingsAwaitingReply: number;
  bookingsLast7Days: number;
  bookingsConfirmedUpcoming: number;
  aiGenerationsToday: number;
};

export async function getAdminOverview(now: Date): Promise<AdminOverview> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const count = async (
    query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  ) => {
    const { count: n, error } = await query;
    if (error) throw toAppError(error, "Could not load the overview.");
    return n ?? 0;
  };
  const head = { count: "exact" as const, head: true };
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  const [
    providersAwaitingReview,
    providersVerified,
    experiencesPublished,
    experiencesLocked,
    destinationsPublished,
    destinationsTotal,
    bookingsAwaitingReply,
    bookingsLast7Days,
    bookingsConfirmedUpcoming,
    ai,
  ] = await Promise.all([
    count(supabase.from("providers").select("id", head).eq("status", "pending_review")),
    count(supabase.from("providers").select("id", head).eq("status", "verified")),
    count(supabase.from("experiences").select("id", head).eq("status", "published")),
    count(supabase.from("experiences").select("id", head).eq("moderation_locked", true)),
    count(supabase.from("destinations").select("id", head).eq("is_published", true)),
    count(supabase.from("destinations").select("id", head)),
    count(supabase.from("bookings").select("id", head).eq("status", "requested")),
    count(supabase.from("bookings").select("id", head).gte("created_at", weekAgo)),
    count(
      supabase
        .from("bookings")
        .select("id", head)
        .eq("status", "confirmed")
        .gte("slot_starts_on", today),
    ),
    supabase.rpc("ai_generations_today"),
  ]);
  if (ai.error) throw toAppError(ai.error, "Could not load the overview.");

  return {
    providersAwaitingReview,
    providersVerified,
    experiencesPublished,
    experiencesLocked,
    destinationsPublished,
    destinationsTotal,
    bookingsAwaitingReply,
    bookingsLast7Days,
    bookingsConfirmedUpcoming,
    aiGenerationsToday: ai.data,
  };
}

// ---------------------------------------------------------------------------
// Provider status history (for the review page)
// ---------------------------------------------------------------------------

export type ProviderStatusEvent = {
  providerId: string;
  fromStatus: ProviderStatus | null;
  toStatus: ProviderStatus;
  note: string | null;
  at: string;
};

export async function listProviderStatusEvents(
  providerIds: readonly string[],
): Promise<ProviderStatusEvent[]> {
  await requireAdmin();
  if (providerIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("provider_status_events")
    .select("provider_id, from_status, to_status, note, created_at")
    .in("provider_id", [...providerIds])
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw toAppError(error, "Could not load provider history.");
  return data.map((e) => ({
    providerId: e.provider_id,
    fromStatus: e.from_status,
    toStatus: e.to_status,
    note: e.note,
    at: e.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Destinations
// ---------------------------------------------------------------------------

export type AdminDestination = {
  id: string;
  slug: string;
  name: string;
  district: string;
  summary: string;
  description: string;
  isPublished: boolean;
  experienceCount: number;
};

export type DestinationInput = {
  slug: string;
  name: string;
  district: string;
  summary: string;
  description: string;
  isPublished: boolean;
};

// An embedded `experiences(count)` reads whole rows, which needs the table-level
// SELECT that API roles deliberately don't have (column grants only). Fetch only
// destination ids and tally them, as the public catalogue does. Bounded; the FK
// `on delete restrict` still blocks deleting a destination that is in use.
const MAX_COUNTED_EXPERIENCES = 10_000;

export async function listAllDestinations(): Promise<AdminDestination[]> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const [destinations, experiences] = await Promise.all([
    supabase
      .from("destinations")
      .select("id, slug, name, district, summary, description, is_published")
      .order("name")
      .limit(500),
    supabase.from("experiences").select("destination_id").limit(MAX_COUNTED_EXPERIENCES),
  ]);
  if (destinations.error) throw toAppError(destinations.error, "Could not load destinations.");
  if (experiences.error) throw toAppError(experiences.error, "Could not load destinations.");
  const counts = new Map<string, number>();
  for (const e of experiences.data) {
    counts.set(e.destination_id, (counts.get(e.destination_id) ?? 0) + 1);
  }
  return destinations.data.map((d) => ({
    id: d.id,
    slug: d.slug,
    name: d.name,
    district: d.district,
    summary: d.summary,
    description: d.description,
    isPublished: d.is_published,
    experienceCount: counts.get(d.id) ?? 0,
  }));
}

function destinationError(error: { code?: string | null; message: string }, fallback: string) {
  if (error.code === "23505") {
    return new AppError("CONFLICT", "That web address is already used by another destination.", {
      fieldErrors: { slug: ["Already in use."] },
      cause: error,
    });
  }
  if (error.code === "23503") {
    return new AppError(
      "CONFLICT",
      "This destination still has experiences. Move or remove them first, or unpublish it instead.",
      { cause: error },
    );
  }
  return toAppError(error, fallback);
}

export async function createDestination(input: DestinationInput): Promise<void> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("destinations").insert({
    slug: input.slug,
    name: input.name,
    district: input.district,
    summary: input.summary,
    description: input.description,
    is_published: input.isPublished,
  });
  if (error) throw destinationError(error, "Could not create the destination.");
}

export async function updateDestination(id: string, input: DestinationInput): Promise<void> {
  await requireAdmin();
  if (!UUID.test(id)) throw new AppError("NOT_FOUND", "We couldn't find that destination.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("destinations")
    .update({
      slug: input.slug,
      name: input.name,
      district: input.district,
      summary: input.summary,
      description: input.description,
      is_published: input.isPublished,
    })
    .eq("id", id)
    .select("id");
  if (error) throw destinationError(error, "Could not save the destination.");
  if (data.length !== 1) throw new AppError("NOT_FOUND", "We couldn't find that destination.");
}

export async function deleteDestination(id: string): Promise<void> {
  await requireAdmin();
  if (!UUID.test(id)) throw new AppError("NOT_FOUND", "We couldn't find that destination.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("destinations").delete().eq("id", id).select("id");
  if (error) throw destinationError(error, "Could not delete the destination.");
  if (data.length !== 1) throw new AppError("NOT_FOUND", "We couldn't find that destination.");
}

// ---------------------------------------------------------------------------
// Experience moderation
// ---------------------------------------------------------------------------

export type AdminExperience = {
  id: string;
  slug: string;
  title: string;
  status: ExperienceStatus;
  moderationLocked: boolean;
  providerName: string;
  providerStatus: ProviderStatus;
  destinationName: string;
  updatedAt: string;
};

export async function listExperiencesForModeration(filter: {
  status?: ExperienceStatus | undefined;
  q?: string | undefined;
}): Promise<AdminExperience[]> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("experiences")
    .select(
      "id, slug, title, status, moderation_locked, updated_at, provider:providers!inner(display_name, status), destination:destinations!inner(name)",
    );
  if (filter.status) query = query.eq("status", filter.status);
  // Bound parameter (websearch_to_tsquery), never PostgREST filter syntax.
  if (filter.q)
    query = query.textSearch("search_vector", filter.q, { type: "websearch", config: "english" });
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(200);
  if (error) throw toAppError(error, "Could not load experiences.");
  return data.map((e) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    status: e.status,
    moderationLocked: e.moderation_locked,
    providerName: e.provider.display_name,
    providerStatus: e.provider.status,
    destinationName: e.destination.name,
    updatedAt: e.updated_at,
  }));
}

export type ModerationAction = "publish" | "unpublish" | "archive";

const ACTION_STATUS: Record<ModerationAction, ExperienceStatus> = {
  publish: "published",
  unpublish: "draft",
  archive: "archived",
};

/**
 * Unpublish/archive by an admin sets moderation_locked (the provider can't
 * republish); publishing by an admin clears it. Enforced by the
 * experiences_enforce_moderation trigger, not here.
 */
export async function moderateExperience(id: string, action: ModerationAction): Promise<void> {
  await requireAdmin();
  if (!UUID.test(id)) throw new AppError("NOT_FOUND", "We couldn't find that experience.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("experiences")
    .update({ status: ACTION_STATUS[action] })
    .eq("id", id)
    .select("id");
  if (error) {
    // The admin update policy only allows publishing for a verified provider
    // and a published destination.
    if (error.code === "42501") {
      throw new AppError(
        "CONFLICT",
        "This experience can only be published when its provider is verified and its destination is published.",
        { cause: error },
      );
    }
    throw toAppError(error, "Could not update the experience.");
  }
  if (data.length !== 1) throw new AppError("NOT_FOUND", "We couldn't find that experience.");
}

// ---------------------------------------------------------------------------
// Bookings overview (read-only; no traveller contact details)
// ---------------------------------------------------------------------------

export type AdminBooking = {
  id: string;
  reference: string;
  status: BookingStatus;
  experienceTitle: string;
  providerName: string;
  slotStartsOn: string;
  partySize: number;
  requestExpiresAt: string;
  createdAt: string;
};

export async function listAllBookings(filter: {
  status?: BookingStatus | undefined;
}): Promise<AdminBooking[]> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("bookings")
    .select(
      "id, reference, status, experience_title, slot_starts_on, party_size, request_expires_at, created_at, provider:providers!bookings_provider_id_fkey(display_name)",
    );
  if (filter.status) query = query.eq("status", filter.status);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(200);
  if (error) throw toAppError(error, "Could not load bookings.");
  return data.map((b) => ({
    id: b.id,
    reference: b.reference,
    status: b.status,
    experienceTitle: b.experience_title,
    providerName: b.provider?.display_name ?? "—",
    slotStartsOn: b.slot_starts_on,
    partySize: b.party_size ?? 0,
    requestExpiresAt: b.request_expires_at,
    createdAt: b.created_at,
  }));
}
