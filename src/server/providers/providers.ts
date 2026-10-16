import "server-only";

import { AppError } from "@/lib/errors";
import { toAppError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin, requireUser } from "@/server/auth/session";
import type { ExperienceCategory } from "@/lib/catalog-options";
import type { ListingType, PriceUnit } from "@/lib/listing-options";
import {
  canPublishExperience,
  isValidReview,
  type ProviderStatus,
  type ReviewDecision,
  reviewRequiresNote,
} from "@/server/providers/status";
import type { Database } from "@/types/database";

export type ExperienceStatus = Database["public"]["Enums"]["experience_status"];

export type ProviderExperience = {
  id: string;
  title: string;
  status: ExperienceStatus;
  category: ExperienceCategory;
  durationMinutes: number;
  priceFromMinor: number | null;
  destinationName: string | null; // null when the destination is unpublished
  moderationLocked: boolean;
  acceptsBookings: boolean;
  listingType: ListingType;
  priceUnit: PriceUnit;
  dailyCapacity: number | null;
  languages: string[];
  routeToName: string | null; // transport: the far end of the route
};

export type MyProvider = {
  id: string;
  slug: string;
  displayName: string;
  district: string | null;
  status: ProviderStatus;
  latestReviewNote: string | null;
  experiences: ProviderExperience[];
};

/** Providers the current user belongs to, with their experiences. */
export async function listMyProviders(): Promise<MyProvider[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("provider_members")
    .select(
      "provider:providers(id, slug, display_name, district, status, experiences(id, title, status, category, duration_minutes, price_from_minor, moderation_locked, accepts_bookings, listing_type, price_unit, daily_capacity, languages, destination:destinations!experiences_destination_id_fkey(name), route_to:destinations!experiences_route_to_destination_id_fkey(name)))",
    )
    .eq("user_id", user.id);
  if (error) {
    throw toAppError(error, "Could not load your providers.");
  }

  const providers = data.flatMap((row) => (row.provider ? [row.provider] : []));
  if (providers.length === 0) {
    return [];
  }

  const { data: events, error: eventsError } = await supabase
    .from("provider_status_events")
    .select("provider_id, note")
    .in(
      "provider_id",
      providers.map((p) => p.id),
    )
    .not("note", "is", null)
    .order("created_at", { ascending: false });
  if (eventsError) {
    throw toAppError(eventsError, "Could not load your providers.");
  }

  return providers.map((p) => ({
    id: p.id,
    slug: p.slug,
    displayName: p.display_name,
    district: p.district,
    status: p.status,
    latestReviewNote: events.find((e) => e.provider_id === p.id)?.note ?? null,
    experiences: p.experiences.map((e) => ({
      id: e.id,
      title: e.title,
      status: e.status,
      category: e.category,
      durationMinutes: e.duration_minutes,
      priceFromMinor: e.price_from_minor,
      destinationName: e.destination?.name ?? null,
      moderationLocked: e.moderation_locked,
      acceptsBookings: e.accepts_bookings,
      listingType: e.listing_type,
      priceUnit: e.price_unit,
      dailyCapacity: e.daily_capacity,
      languages: e.languages,
      routeToName: e.route_to?.name ?? null,
    })),
  }));
}

export type ProviderApplicationInput = {
  slug: string;
  displayName: string;
  description: string;
  district: string;
  legalName: string;
  contactEmail: string;
  contactPhone: string;
};

export async function createProviderApplication(input: ProviderApplicationInput): Promise<string> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_provider_application", {
    p_slug: input.slug,
    p_display_name: input.displayName,
    p_description: input.description,
    p_district: input.district,
    p_legal_name: input.legalName,
    p_contact_email: input.contactEmail,
    p_contact_phone: input.contactPhone,
  });
  if (error) {
    throw toAppError(error, "Could not create the application.");
  }
  return data;
}

export async function submitProviderApplication(providerId: string): Promise<ProviderStatus> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_provider_application", {
    p_provider_id: providerId,
  });
  if (error) {
    throw toAppError(error, "Could not submit the application.");
  }
  return data;
}

export type ProviderForReview = {
  id: string;
  slug: string;
  displayName: string;
  district: string | null;
  status: ProviderStatus;
  legalName: string | null;
  contactEmail: string | null;
};

/** Admin review queue: every provider that has left draft. */
export async function listProvidersForReview(): Promise<ProviderForReview[]> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("providers")
    .select(
      "id, slug, display_name, district, status, details:provider_private_details(legal_name, contact_email)",
    )
    .neq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) {
    throw toAppError(error, "Could not load providers.");
  }
  return data.map((p) => ({
    id: p.id,
    slug: p.slug,
    displayName: p.display_name,
    district: p.district,
    status: p.status,
    legalName: p.details?.legal_name ?? null,
    contactEmail: p.details?.contact_email ?? null,
  }));
}

export async function reviewProvider(
  providerId: string,
  decision: ReviewDecision,
  note: string,
): Promise<ProviderStatus> {
  await requireAdmin();
  if (reviewRequiresNote(decision) && note.trim().length === 0) {
    throw new AppError("VALIDATION_FAILED", "Please add a note explaining this decision.", {
      fieldErrors: { note: ["Required when rejecting or suspending."] },
    });
  }
  const supabase = await createSupabaseServerClient();
  const { data: current, error: currentError } = await supabase
    .from("providers")
    .select("status")
    .eq("id", providerId)
    .maybeSingle();
  if (currentError) {
    throw toAppError(currentError, "Could not load the provider.");
  }
  if (!current) {
    throw new AppError("NOT_FOUND", "We couldn't find that provider.");
  }
  if (!isValidReview(current.status, decision)) {
    throw new AppError(
      "CONFLICT",
      "That decision isn't available in the provider's current status.",
    );
  }
  // The database function re-checks admin role, conflict of interest and the
  // transition atomically; the checks above only give friendlier errors.
  const { data, error } = await supabase.rpc("review_provider", {
    p_provider_id: providerId,
    p_decision: decision,
    p_note: note,
  });
  if (error) {
    throw toAppError(error, "Could not record the decision.");
  }
  return data;
}

export type ListingTypeFields = {
  listingType: ListingType;
  priceUnit: PriceUnit;
  dailyCapacity: number | null;
  maxGuests: number | null;
  languages: string[];
  routeToDestinationId: string | null;
};

export type NewExperienceInput = ListingTypeFields & {
  providerId: string;
  destinationId: string;
  slug: string;
  title: string;
  summary: string;
  category: ExperienceCategory;
  durationMinutes: number;
  priceFromMinor: number | null;
};

/** Creates a draft. Publishing is a separate, policy-checked step. */
export async function createExperience(input: NewExperienceInput): Promise<string> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("experiences")
    .insert({
      provider_id: input.providerId,
      destination_id: input.destinationId,
      slug: input.slug,
      title: input.title,
      summary: input.summary,
      category: input.category,
      duration_minutes: input.durationMinutes,
      price_from_minor: input.priceFromMinor,
      listing_type: input.listingType,
      price_unit: input.priceUnit,
      daily_capacity: input.dailyCapacity,
      max_guests: input.maxGuests,
      languages: input.languages,
      route_to_destination_id: input.routeToDestinationId,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) {
    throw toAppError(error, "Could not create the experience.");
  }
  return data.id;
}

export async function setExperienceStatus(
  experienceId: string,
  status: ExperienceStatus,
): Promise<void> {
  await requireUser();
  const supabase = await createSupabaseServerClient();

  if (status === "published") {
    const { data: row, error: rowError } = await supabase
      .from("experiences")
      .select(
        "moderation_locked, provider:providers(status), destination:destinations!experiences_destination_id_fkey(is_published)",
      )
      .eq("id", experienceId)
      .maybeSingle();
    if (rowError) {
      throw toAppError(rowError, "Could not load the experience.");
    }
    if (!row?.provider) {
      throw new AppError("NOT_FOUND", "We couldn't find that experience.");
    }
    if (row.moderation_locked) {
      // The database trigger enforces this for members; this only gives a clearer message.
      throw new AppError(
        "CONFLICT",
        "This experience was unpublished by Himverse moderation. Please contact us to have it reviewed.",
      );
    }
    if (!canPublishExperience(row.provider.status, row.destination?.is_published ?? false)) {
      throw new AppError(
        "CONFLICT",
        "Experiences can be published only while your provider is verified and the destination is published.",
      );
    }
  }

  // RLS enforces the same rule; a filtered-out row updates nothing.
  const { data, error } = await supabase
    .from("experiences")
    .update({ status })
    .eq("id", experienceId)
    .select("id");
  if (error) {
    throw toAppError(error, "Could not update the experience.");
  }
  if (data.length !== 1) {
    throw new AppError("NOT_FOUND", "We couldn't find that experience.");
  }
}

/** Provider-controlled: whether travellers can request this experience (and the AI can plan with it). */
export async function setExperienceAcceptsBookings(
  experienceId: string,
  acceptsBookings: boolean,
): Promise<void> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  // RLS: only the provider's members (or admins) can update; others match no row.
  const { data, error } = await supabase
    .from("experiences")
    .update({ accepts_bookings: acceptsBookings })
    .eq("id", experienceId)
    .select("id");
  if (error) {
    throw toAppError(error, "Could not update the experience.");
  }
  if (data.length !== 1) {
    throw new AppError("NOT_FOUND", "We couldn't find that experience.");
  }
}

/**
 * Puts every non-archived listing of one type online or offline at once (a
 * homestay closing for the season). Returns how many changed; re-running is a
 * no-op. RLS limits the update to the provider's members.
 */
export async function setListingTypeAcceptsBookings(
  providerId: string,
  listingType: ListingType,
  acceptsBookings: boolean,
): Promise<number> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("experiences")
    .update({ accepts_bookings: acceptsBookings })
    .eq("provider_id", providerId)
    .eq("listing_type", listingType)
    .neq("status", "archived")
    .neq("accepts_bookings", acceptsBookings)
    .select("id");
  if (error) {
    throw toAppError(error, "Could not update your listings.");
  }
  return data.length;
}
