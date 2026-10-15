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

/**
 * Indicative minimum from database "from" prices: each line is a price and how
 * many times it applies (travellers for an activity, rooms for a stay night,
 * vehicles for a transport leg). Mirrors save_itinerary_version.
 */
export function estimateCost(
  lines: ReadonlyArray<{ priceMinor: number | null; quantity: number }>,
): CostEstimate {
  let total = 0;
  let unpriced = 0;
  for (const line of lines) {
    if (line.priceMinor === null) unpriced += 1;
    else total += line.priceMinor * line.quantity;
  }
  return { totalMinor: total, unpricedItemCount: unpriced };
}

/** Rooms or vehicles needed for the whole group. */
export function unitsFor(travellers: number, perUnit: number): number {
  return Math.ceil(travellers / perUnit);
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
  const lines: Array<{ priceMinor: number | null; quantity: number }> = [];
  const travellers = travelerCount(prefs);
  let previousBaseId: string | null = null;

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
      lines.push({ priceMinor: experience.priceFromMinor, quantity: travellers });
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

    // The night's stay: at the day's base, with enough rooms for everyone.
    let stay: ResolvedPlan["days"][number]["stay"] = null;
    if (day.stay) {
      const candidate = aliases.stays.get(day.stay);
      if (day.day >= n) {
        errors.push(`Day ${day.day} is the last day: leave its stay empty.`);
      } else if (!candidate) {
        errors.push(`Day ${day.day}: stay ${day.stay} is not in the list.`);
      } else if (candidate.destinationId !== base.id) {
        errors.push(`Day ${day.day}: stay ${day.stay} is not at the day's base ${day.base}.`);
      } else {
        const rooms = unitsFor(travellers, candidate.maxGuests);
        if (rooms > candidate.dailyCapacity) {
          errors.push(
            `Day ${day.day}: stay ${day.stay} doesn't have enough rooms for ${travellers}.`,
          );
        } else {
          stay = { experienceId: candidate.id, units: rooms };
          lines.push({ priceMinor: candidate.priceFromMinor, quantity: rooms });
        }
      }
    }

    // Transport: a route from the previous base to this one, or day hire here.
    let transport: ResolvedPlan["days"][number]["transport"] = null;
    if (day.transport) {
      const candidate = aliases.transport.get(day.transport);
      if (!candidate) {
        errors.push(`Day ${day.day}: transport ${day.transport} is not in the list.`);
      } else {
        const fits = candidate.routeToDestinationId
          ? candidate.routeToDestinationId === base.id &&
            (previousBaseId === null || candidate.destinationId === previousBaseId)
          : candidate.destinationId === base.id;
        const vehicles = unitsFor(travellers, candidate.maxGuests);
        if (!fits) {
          errors.push(
            `Day ${day.day}: transport ${day.transport} doesn't go from the previous base to ${day.base}.`,
          );
        } else if (vehicles > candidate.dailyCapacity) {
          errors.push(
            `Day ${day.day}: transport ${day.transport} doesn't have enough seats for ${travellers}.`,
          );
        } else {
          transport = { experienceId: candidate.id, units: vehicles };
          lines.push({ priceMinor: candidate.priceFromMinor, quantity: vehicles });
        }
      }
    }
    if (previousBaseId !== null && previousBaseId !== base.id && !transport) {
      warnings.push(
        `Day ${day.day}: arrange travel to ${base.name}; no transport is booked for it.`,
      );
    }
    previousBaseId = base.id;

    plannedDays.push({
      dayNumber: day.day,
      date: dateOfDay(prefs, day.day),
      destinationId: base.id,
      note: (day.note ?? "").trim(),
      items,
      stay,
      transport,
    });
  }

  if (seen.size === 0) {
    errors.push("Include at least one experience from the list.");
  }

  const estimate = estimateCost(lines);
  if (prefs.budgetMaxMinor !== undefined && estimate.totalMinor > prefs.budgetMaxMinor) {
    errors.push(
      `The plan costs at least ₹${Math.ceil(estimate.totalMinor / 100)} for ${travelerCount(prefs)} travellers, over the ₹${Math.floor(prefs.budgetMaxMinor / 100)} budget. Choose cheaper or fewer experiences, stays or transport.`,
    );
  }
  if (estimate.unpricedItemCount > 0) {
    warnings.push(
      `${estimate.unpricedItemCount} item${estimate.unpricedItemCount === 1 ? " has" : "s have"} no listed price; the estimate excludes ${estimate.unpricedItemCount === 1 ? "it" : "them"}.`,
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
