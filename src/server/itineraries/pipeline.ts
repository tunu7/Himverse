import { AppError } from "@/lib/errors";
import { ModelError, type ItineraryModel } from "@/server/itineraries/model/types";
import type { TripPreferences } from "@/server/itineraries/preferences";
import {
  type AliasMap,
  buildAliases,
  buildPrompt,
  buildRepairPrompt,
  PROMPT_VERSION,
} from "@/server/itineraries/prompt";
import {
  type Candidates,
  type ItineraryDraft,
  itineraryDraftSchema,
  type ResolvedPlan,
  SCHEMA_VERSION,
} from "@/server/itineraries/schemas";
import { validateDraft } from "@/server/itineraries/validate";

/**
 * Itinerary generation pipeline (ADR-0003):
 * quota → retrieve → (none? stop) → prompt → model → schema + grounding checks →
 * (one repair attempt) → persist (RPC re-checks visibility) → log.
 *
 * Every dependency is injected so each failure mode is unit-testable without a
 * network, database or real model.
 */

export const GENERATION_LIMITS = { perHour: 10, perDay: 30 } as const;
export const MODEL_TIMEOUT_MS = 45_000;
export const MAX_OUTPUT_TOKENS = 4_000;
const MAX_ATTEMPTS = 2;

export type GenerationKind = "generate" | "refine" | "regenerate";

export type SaveVersionInput = {
  itineraryId: string | null;
  title: string;
  kind: GenerationKind;
  preferences: TripPreferences;
  plan: ResolvedPlan;
  schemaVersion: string;
  promptVersion: string;
  model: string;
  travelers: number;
  warnings: string[];
};

export type SavedVersion = {
  itineraryId: string;
  versionId: string;
  versionNumber: number;
  estimatedTotalMinor: number;
  unpricedItemCount: number;
};

export type GenerationLogEntry = {
  itineraryId: string | null;
  outcome: "succeeded" | "failed_validation" | "failed_upstream" | "failed_timeout" | "failed_save";
  errorCode: string | null;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
};

export type PipelineDeps = {
  model: ItineraryModel;
  retrieve: (prefs: TripPreferences) => Promise<Candidates>;
  save: (input: SaveVersionInput) => Promise<SavedVersion>;
  record: (entry: GenerationLogEntry) => Promise<void>;
  quota: () => Promise<{ lastHour: number; lastDay: number }>;
  clock?: () => number;
};

export type GenerationRequest = {
  prefs: TripPreferences;
  kind: GenerationKind;
  /** Existing itinerary for refine/regenerate; null creates a new one. */
  itineraryId: string | null;
  /** Plan to revise (refine only) and the traveller's change request. */
  refinement?: { previous: ResolvedPlan; request: string };
};

/** Error codes raised by save_itinerary_version (see the itineraries migration). */
export class SaveConflictError extends Error {
  override readonly name = "SaveConflictError";
}

export async function runItineraryGeneration(
  request: GenerationRequest,
  deps: PipelineDeps,
): Promise<SavedVersion> {
  const clock = deps.clock ?? Date.now;

  const quota = await deps.quota();
  if (quota.lastHour >= GENERATION_LIMITS.perHour || quota.lastDay >= GENERATION_LIMITS.perDay) {
    throw new AppError(
      "RATE_LIMITED",
      `You've reached the itinerary limit (${GENERATION_LIMITS.perHour} per hour, ${GENERATION_LIMITS.perDay} per day). Please try again later.`,
    );
  }

  const candidates = await deps.retrieve(request.prefs);
  if (candidates.experiences.length === 0) {
    // Never invent inventory, and don't spend a model call on an empty list.
    throw new AppError(
      "NOT_FOUND",
      "We couldn't find published experiences that match these preferences. Try another region, fewer interests or a higher budget.",
    );
  }

  const aliases = buildAliases(candidates);
  const base = buildPrompt(
    request.prefs,
    candidates,
    aliases,
    request.refinement
      ? {
          previous: toAliasedDraft(request.refinement.previous, aliases),
          request: request.refinement.request,
        }
      : undefined,
  );

  const started = clock();
  const usage = { inputTokens: 0, outputTokens: 0 };
  let modelId = deps.model.id;
  let prompt = base;
  let lastErrors: string[] = [];
  let lastBudgetTotal: number | undefined;

  const log = async (
    outcome: GenerationLogEntry["outcome"],
    errorCode: string | null,
    itineraryId: string | null,
  ) => {
    try {
      await deps.record({
        itineraryId,
        outcome,
        errorCode,
        model: modelId,
        latencyMs: Math.max(0, Math.round(clock() - started)),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });
    } catch (error) {
      // Logging must never mask the real outcome.
      console.error({ event: "itineraries.log_failed", code: (error as { code?: string }).code });
    }
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let draft: unknown;
    try {
      const result = await deps.model.generate({
        system: prompt.system,
        prompt: prompt.prompt,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        timeoutMs: MODEL_TIMEOUT_MS,
      });
      modelId = result.model;
      usage.inputTokens += result.usage.inputTokens ?? 0;
      usage.outputTokens += result.usage.outputTokens ?? 0;
      draft = result.draft;
    } catch (error) {
      if (
        error instanceof ModelError &&
        error.kind === "invalid_output" &&
        attempt < MAX_ATTEMPTS
      ) {
        lastErrors = ["Your answer was not valid JSON matching the required format."];
        prompt = buildRepairPrompt(base, null, lastErrors);
        continue;
      }
      if (error instanceof ModelError && error.kind === "timeout") {
        await log("failed_timeout", "timeout", request.itineraryId);
        throw new AppError("UPSTREAM_UNAVAILABLE", "Planning took too long. Please try again.", {
          cause: error,
        });
      }
      if (error instanceof ModelError && error.kind === "invalid_output") {
        await log("failed_validation", "invalid_output", request.itineraryId);
        throw invalidItineraryError();
      }
      await log("failed_upstream", "model_unavailable", request.itineraryId);
      throw new AppError(
        "UPSTREAM_UNAVAILABLE",
        "The itinerary planner is unavailable right now. Please try again shortly.",
        { cause: error },
      );
    }

    // The gateway adapter already schema-checks; re-check so no adapter can bypass it.
    const parsed = itineraryDraftSchema.safeParse(draft);
    if (!parsed.success) {
      lastErrors = ["Your answer did not match the required JSON format."];
      if (attempt < MAX_ATTEMPTS) {
        prompt = buildRepairPrompt(base, draft, lastErrors);
        continue;
      }
      break;
    }

    const validation = validateDraft(parsed.data, request.prefs, aliases);
    if (!validation.ok) {
      lastErrors = validation.errors;
      lastBudgetTotal = validation.estimate?.totalMinor;
      if (attempt < MAX_ATTEMPTS) {
        prompt = buildRepairPrompt(base, parsed.data, validation.errors);
        continue;
      }
      break;
    }

    let saved: SavedVersion;
    try {
      saved = await deps.save({
        itineraryId: request.itineraryId,
        title: validation.plan.title,
        kind: request.kind,
        preferences: request.prefs,
        plan: validation.plan,
        schemaVersion: SCHEMA_VERSION,
        promptVersion: PROMPT_VERSION,
        model: modelId,
        travelers: request.prefs.adults + request.prefs.children,
        warnings: [
          ...(candidates.widened
            ? ["Few experiences matched your interests, so other categories were included."]
            : []),
          ...validation.warnings,
        ],
      });
    } catch (error) {
      await log(
        "failed_save",
        error instanceof SaveConflictError ? "inventory_changed" : "save_failed",
        request.itineraryId,
      );
      if (error instanceof SaveConflictError) {
        throw new AppError(
          "CONFLICT",
          "Some suggested experiences are no longer available. Please generate the itinerary again.",
          { cause: error },
        );
      }
      throw error;
    }
    await log("succeeded", null, saved.itineraryId);
    return saved;
  }

  await log(
    "failed_validation",
    lastErrors.some(isBudgetError) ? "over_budget" : "invalid_plan",
    request.itineraryId,
  );
  if (lastErrors.some(isBudgetError) && request.prefs.budgetMaxMinor !== undefined) {
    throw new AppError(
      "VALIDATION_FAILED",
      `We couldn't fit an itinerary within your budget${
        lastBudgetTotal !== undefined
          ? ` (the closest plan cost at least ₹${Math.ceil(lastBudgetTotal / 100)})`
          : ""
      }. Try a higher budget, fewer days or fewer travellers.`,
      { fieldErrors: { budgetRupees: ["Too low for the available experiences."] } },
    );
  }
  throw invalidItineraryError();
}

function invalidItineraryError(): AppError {
  return new AppError(
    "UPSTREAM_UNAVAILABLE",
    "We couldn't create a valid itinerary this time. Please try again or adjust your preferences.",
  );
}

function isBudgetError(message: string): boolean {
  return message.includes("budget");
}

/**
 * Re-expresses a saved plan in the aliases of a fresh retrieval, for
 * refinement. Items whose experience is no longer retrievable are dropped.
 */
export function toAliasedDraft(plan: ResolvedPlan, aliases: AliasMap): ItineraryDraft {
  const experienceAlias = new Map([...aliases.experiences].map(([alias, e]) => [e.id, alias]));
  const destinationAlias = new Map([...aliases.destinations].map(([alias, d]) => [d.id, alias]));
  const fallbackBase = [...aliases.destinations.keys()][0] ?? "D1";
  return {
    title: plan.title.slice(0, 80),
    summary: plan.summary.slice(0, 800),
    cautions: plan.cautions.slice(0, 8),
    days: plan.days.map((day) => ({
      day: day.dayNumber,
      base: destinationAlias.get(day.destinationId) ?? fallbackBase,
      note: day.note.slice(0, 300) || undefined,
      items: day.items.flatMap((item) => {
        const alias = experienceAlias.get(item.experienceId);
        return alias
          ? [
              {
                experience: alias,
                timeOfDay: item.timeOfDay,
                rationale: item.rationale.slice(0, 300),
              },
            ]
          : [];
      }),
    })),
  };
}
