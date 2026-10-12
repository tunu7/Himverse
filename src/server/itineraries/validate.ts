import { PACES } from "@/lib/itinerary-options";
import { dateOfDay, type TripPreferences, travelerCount } from "@/server/itineraries/preferences";
import type { AliasMap } from "@/server/itineraries/prompt";
import type { ItineraryDraft, ResolvedPlan } from "@/server/itineraries/schemas";

/**
 * Deterministic grounding and constraint checks on schema-valid model output.
 * Nothing the model says about cost, dates or availability is trusted: dates
 * come from the preferences, prices from retrieved database rows.
 */

export type ValidationResult =
  | { ok: true; plan: ResolvedPlan; estimate: CostEstimate; warnings: string[] }
  | { ok: false; errors: string[]; estimate?: CostEstimate };

export type CostEstimate = { totalMinor: number; unpricedItemCount: number };

/** Indicative minimum: per-person "from" prices x travellers (ADR-0003 assumption). */
export function estimateCost(
  prices: ReadonlyArray<number | null>,
  travellers: number,
): CostEstimate {
  let total = 0;
  let unpriced = 0;
  for (const price of prices) {
    if (price === null) unpriced += 1;
    else total += price * travellers;
  }
  return { totalMinor: total, unpricedItemCount: unpriced };
}

const MULTI_DAY_MINUTES = 1440;

export function validateDraft(
  draft: ItineraryDraft,
  prefs: TripPreferences,
  aliases: AliasMap,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const capacity = PACES[prefs.pace].dailyCapacityMinutes;
  const n = prefs.durationDays;

  const dayNumbers = draft.days.map((d) => d.day);
  if (
    draft.days.length !== n ||
    new Set(dayNumbers).size !== n ||
    dayNumbers.some((d) => d < 1 || d > n)
  ) {
    errors.push(`Return exactly ${n} days numbered 1 to ${n}, each once.`);
  }

  const seen = new Set<string>();
  // Days covered by a multi-day experience that started earlier: dayNumber -> base alias.
  const reserved = new Map<number, string>();
  const plannedDays: ResolvedPlan["days"] = [];
  const prices: Array<number | null> = [];

  for (const day of [...draft.days].sort((a, b) => a.day - b.day)) {
    const base = aliases.destinations.get(day.base);
    if (!base) {
      errors.push(`Day ${day.day}: destination ${day.base} is not in the list.`);
      continue;
    }
    if (reserved.has(day.day)) {
      if (reserved.get(day.day) !== day.base) {
        errors.push(
          `Day ${day.day}: must stay at the destination of the multi-day experience that covers it.`,
        );
      }
      if (day.items.length > 0) {
        errors.push(
          `Day ${day.day} is covered by a multi-day experience and must have no other items.`,
        );
      }
    }

    let minutes = 0;
    const items: ResolvedPlan["days"][number]["items"] = [];
    for (const item of day.items) {
      const experience = aliases.experiences.get(item.experience);
      if (!experience) {
        errors.push(`Day ${day.day}: experience ${item.experience} is not in the list.`);
        continue;
      }
      if (seen.has(item.experience)) {
        errors.push(`Experience ${item.experience} is used more than once.`);
        continue;
      }
      seen.add(item.experience);
      if (experience.destinationId !== base.id) {
        errors.push(
          `Day ${day.day}: ${item.experience} is not at the day's destination ${day.base}.`,
        );
        continue;
      }
      if (experience.durationMinutes >= MULTI_DAY_MINUTES) {
        const span = Math.ceil(experience.durationMinutes / MULTI_DAY_MINUTES);
        if (day.items.length !== 1) {
          errors.push(
            `Day ${day.day}: multi-day experience ${item.experience} must be the only item that day.`,
          );
        }
        if (day.day + span - 1 > n) {
          errors.push(
            `Experience ${item.experience} lasts ${span} days and doesn't fit before the trip ends.`,
          );
        }
        for (let d = day.day + 1; d < day.day + span; d++) reserved.set(d, day.base);
      } else {
        minutes += experience.durationMinutes;
      }
      prices.push(experience.priceFromMinor);
      items.push({
        experienceId: experience.id,
        destinationId: experience.destinationId,
        timeOfDay: item.timeOfDay,
        rationale: item.rationale.trim(),
      });
    }
    if (minutes > capacity) {
      errors.push(
        `Day ${day.day} has ${minutes} minutes of activities; the ${prefs.pace} pace allows at most ${capacity}.`,
      );
    }
    if (items.length === 0 && !reserved.has(day.day)) {
      warnings.push(`Day ${day.day} has no planned experiences (free day).`);
    }
    plannedDays.push({
      dayNumber: day.day,
      date: dateOfDay(prefs, day.day),
      destinationId: base.id,
      note: (day.note ?? "").trim(),
      items,
    });
  }

  if (seen.size === 0) {
    errors.push("Include at least one experience from the list.");
  }

  const estimate = estimateCost(prices, travelerCount(prefs));
  if (prefs.budgetMaxMinor !== undefined && estimate.totalMinor > prefs.budgetMaxMinor) {
    errors.push(
      `The planned experiences cost at least ₹${Math.ceil(estimate.totalMinor / 100)} for ${travelerCount(prefs)} travellers, over the ₹${Math.floor(prefs.budgetMaxMinor / 100)} budget. Choose cheaper or fewer experiences.`,
    );
  }
  if (estimate.unpricedItemCount > 0) {
    warnings.push(
      `${estimate.unpricedItemCount} experience${estimate.unpricedItemCount === 1 ? " has" : "s have"} no listed price; the estimate excludes ${estimate.unpricedItemCount === 1 ? "it" : "them"}.`,
    );
  }

  if (errors.length > 0) {
    return { ok: false, errors, estimate };
  }
  return {
    ok: true,
    estimate,
    warnings,
    plan: {
      title: draft.title.trim(),
      summary: draft.summary.trim(),
      cautions: draft.cautions.map((c) => c.trim()).filter(Boolean),
      days: plannedDays,
    },
  };
}
