import "server-only";

import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { toAppError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/server/auth/session";
import {
  GENERATION_LIMITS,
  type GenerationLogEntry,
  type SavedVersion,
  SaveConflictError,
  type SaveVersionInput,
} from "@/server/itineraries/pipeline";
import { storedPreferencesSchema, type TripPreferences } from "@/server/itineraries/preferences";
import { PROMPT_VERSION } from "@/server/itineraries/prompt";
import {
  type ResolvedPlan,
  resolvedPlanSchema,
  type TimeOfDay,
} from "@/server/itineraries/schemas";

// Every itinerary read and write runs as the signed-in user, so RLS limits it to
// their own rows; writes go through the RPCs in the itineraries migration.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Reserves an itinerary generation. The database applies the per-user and
 * platform-wide limits under a per-user lock, so parallel requests can't overrun them.
 */
export async function beginGeneration(input: {
  itineraryId: string | null;
  globalDailyLimit: number;
}): Promise<number> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("begin_itinerary_generation", {
    // Nullable in SQL; generated RPC types mark arguments non-null.
    p_itinerary_id: input.itineraryId as string,
    p_global_daily_limit: input.globalDailyLimit,
  });
  if (error) {
    if (error.code === "54000" && error.message.includes("busy")) {
      // Platform-wide cost guard; logged so operators notice.
      logger.error("itineraries.global_daily_limit_reached", { limit: input.globalDailyLimit });
      throw new AppError(
        "RATE_LIMITED",
        "Trip planning is very busy today. Please try again tomorrow.",
        {
          cause: error,
        },
      );
    }
    if (error.code === "54000") {
      throw new AppError(
        "RATE_LIMITED",
        `You've reached the itinerary limit (${GENERATION_LIMITS.perHour} per hour, ${GENERATION_LIMITS.perDay} per day). Please try again later.`,
        { cause: error },
      );
    }
    throw toAppError(error, "Could not start planning your itinerary.");
  }
  return data;
}

export async function saveItineraryVersion(input: SaveVersionInput): Promise<SavedVersion> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_itinerary_version", {
    p_generation_id: input.generationId,
    // Generated RPC types mark every argument non-null; the function accepts null
    // here (null creates a new itinerary).
    p_itinerary_id: input.itineraryId as string,
    p_title: input.title,
    p_kind: input.kind,
    p_preferences: input.preferences,
    p_plan: input.plan,
    p_schema_version: input.schemaVersion,
    p_prompt_version: input.promptVersion,
    p_model: input.model,
    p_travelers: input.travelers,
    p_warnings: input.warnings,
    p_items: input.plan.days.flatMap((day) =>
      day.items.map((item, index) => ({
        day_number: day.dayNumber,
        position: index + 1,
        experience_id: item.experienceId,
        destination_id: item.destinationId,
        time_of_day: item.timeOfDay,
        rationale: item.rationale,
      })),
    ),
  });
  if (error) {
    // 55000 also covers a missing/expired reservation, which isn't an inventory change.
    if (error.code === "55000" && !error.message.includes("generation")) {
      throw new SaveConflictError(error.message);
    }
    throw toAppError(error, "Could not save the itinerary.");
  }
  const row = data[0];
  if (!row) throw new AppError("INTERNAL", "Could not save the itinerary.");
  return {
    itineraryId: row.itinerary_id,
    versionId: row.version_id,
    versionNumber: row.version_number,
    estimatedTotalMinor: row.estimated_total_minor,
    unpricedItemCount: row.unpriced_item_count,
  };
}

export async function finishGeneration(entry: GenerationLogEntry): Promise<void> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("finish_itinerary_generation", {
    p_generation_id: entry.generationId,
    p_outcome: entry.outcome,
    p_error_code: entry.errorCode as string,
    p_model: entry.model,
    p_prompt_version: PROMPT_VERSION,
    p_latency_ms: entry.latencyMs,
    p_input_tokens: entry.inputTokens,
    p_output_tokens: entry.outputTokens,
  });
  if (error) throw toAppError(error, "Could not record the generation.");
}

export type ItineraryListItem = {
  id: string;
  title: string;
  updatedAt: string;
  versionCount: number;
};

export async function listMyItineraries(): Promise<ItineraryListItem[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("itineraries")
    .select(
      "id, title, updated_at, versions:itinerary_versions!itinerary_versions_itinerary_id_fkey(count)",
    )
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw toAppError(error, "Could not load your itineraries.");
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
    versionCount: row.versions[0]?.count ?? 0,
  }));
}

export type ItineraryItemView = {
  experienceId: string | null;
  experienceSlug: string | null;
  title: string;
  destinationName: string;
  timeOfDay: TimeOfDay;
  rationale: string;
  priceFromMinor: number | null;
  durationMinutes: number;
  /** False when the experience has since been unpublished or hidden. */
  stillAvailable: boolean;
};

export type ItineraryView = {
  id: string;
  title: string;
  currentVersionNumber: number | null;
  versions: Array<{ number: number; kind: string; createdAt: string; estimatedTotalMinor: number }>;
  version: {
    number: number;
    kind: string;
    model: string;
    createdAt: string;
    travelers: number;
    estimatedTotalMinor: number;
    unpricedItemCount: number;
    warnings: string[];
    preferences: TripPreferences | null;
    plan: ResolvedPlan;
    days: Array<{ dayNumber: number; date: string; note: string; items: ItineraryItemView[] }>;
  };
};

/** An itinerary the caller owns, at the given (or current) version; null if not found or not theirs. */
export async function getMyItinerary(
  id: string,
  versionNumber?: number,
): Promise<ItineraryView | null> {
  if (!UUID.test(id)) return null;
  await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: itinerary, error } = await supabase
    .from("itineraries")
    .select("id, title, current_version_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw toAppError(error, "Could not load this itinerary.");
  if (!itinerary) return null;

  const { data: versions, error: versionsError } = await supabase
    .from("itinerary_versions")
    .select(
      "id, version_number, kind, model, created_at, travelers, estimated_total_minor, unpriced_item_count, warnings, preferences, plan",
    )
    .eq("itinerary_id", id)
    .order("version_number", { ascending: false })
    .limit(100);
  if (versionsError) throw toAppError(versionsError, "Could not load this itinerary.");

  const current = versions.find((v) => v.id === itinerary.current_version_id);
  const selected =
    versionNumber !== undefined
      ? versions.find((v) => v.version_number === versionNumber)
      : (current ?? versions[0]);
  if (!selected) return null;

  const { data: items, error: itemsError } = await supabase
    .from("itinerary_items")
    .select(
      "day_number, position, experience_id, experience_title_snapshot, destination_name_snapshot, time_of_day, rationale, price_snapshot_minor, duration_snapshot_minutes",
    )
    .eq("version_id", selected.id)
    .order("day_number")
    .order("position");
  if (itemsError) throw toAppError(itemsError, "Could not load this itinerary.");

  // Which referenced experiences are still publicly visible (anonymous client = RLS-public set).
  const ids = items.flatMap((i) => (i.experience_id ? [i.experience_id] : []));
  const available = new Map<string, string>();
  if (ids.length > 0) {
    const { data: live, error: liveError } = await createSupabasePublicClient()
      .from("experiences")
      .select("id, slug")
      .in("id", ids);
    if (liveError) throw toAppError(liveError, "Could not load this itinerary.");
    for (const e of live) available.set(e.id, e.slug);
  }

  const plan = resolvedPlanSchema.parse(selected.plan);
  const preferences = storedPreferencesSchema.safeParse(selected.preferences);

  return {
    id: itinerary.id,
    title: itinerary.title,
    currentVersionNumber: current?.version_number ?? null,
    versions: versions.map((v) => ({
      number: v.version_number,
      kind: v.kind,
      createdAt: v.created_at,
      estimatedTotalMinor: v.estimated_total_minor,
    })),
    version: {
      number: selected.version_number,
      kind: selected.kind,
      model: selected.model,
      createdAt: selected.created_at,
      travelers: selected.travelers,
      estimatedTotalMinor: selected.estimated_total_minor,
      unpricedItemCount: selected.unpriced_item_count,
      warnings: Array.isArray(selected.warnings)
        ? selected.warnings.filter((w): w is string => typeof w === "string")
        : [],
      preferences: preferences.success ? preferences.data : null,
      plan,
      days: plan.days.map((day) => ({
        dayNumber: day.dayNumber,
        date: day.date,
        note: day.note,
        items: items
          .filter((i) => i.day_number === day.dayNumber)
          .map((i) => ({
            experienceId: i.experience_id,
            experienceSlug: i.experience_id ? (available.get(i.experience_id) ?? null) : null,
            title: i.experience_title_snapshot,
            destinationName: i.destination_name_snapshot,
            timeOfDay: i.time_of_day,
            rationale: i.rationale,
            priceFromMinor: i.price_snapshot_minor,
            durationMinutes: i.duration_snapshot_minutes,
            stillAvailable: i.experience_id !== null && available.has(i.experience_id),
          })),
      })),
    },
  };
}

export async function setCurrentVersion(itineraryId: string, versionNumber: number): Promise<void> {
  await requireUser();
  if (!UUID.test(itineraryId)) throw new AppError("NOT_FOUND", "We couldn't find that itinerary.");
  const supabase = await createSupabaseServerClient();
  const { data: version, error } = await supabase
    .from("itinerary_versions")
    .select("id")
    .eq("itinerary_id", itineraryId)
    .eq("version_number", versionNumber)
    .maybeSingle();
  if (error) throw toAppError(error, "Could not update the itinerary.");
  if (!version) throw new AppError("NOT_FOUND", "We couldn't find that version.");
  const { data, error: updateError } = await supabase
    .from("itineraries")
    .update({ current_version_id: version.id })
    .eq("id", itineraryId)
    .select("id");
  if (updateError) throw toAppError(updateError, "Could not update the itinerary.");
  if (data.length !== 1) throw new AppError("NOT_FOUND", "We couldn't find that itinerary.");
}

export async function deleteItinerary(itineraryId: string): Promise<void> {
  await requireUser();
  if (!UUID.test(itineraryId)) throw new AppError("NOT_FOUND", "We couldn't find that itinerary.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("itineraries")
    .delete()
    .eq("id", itineraryId)
    .select("id");
  if (error) throw toAppError(error, "Could not delete the itinerary.");
  if (data.length !== 1) throw new AppError("NOT_FOUND", "We couldn't find that itinerary.");
}
