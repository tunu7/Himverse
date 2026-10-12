import type { ItineraryDraft } from "@/server/itineraries/schemas";

import type { ItineraryModel } from "./types";

/**
 * Deterministic model for automated tests and local work without credentials
 * (AI_PROVIDER=mock; refused in production by getAiEnv). It reads the candidate
 * lists from the real prompt, so tests exercise the real prompt builder, and it
 * only ever uses listed aliases. Refinement requests produce a different plan.
 */
export const MOCK_MODEL_ID = "mock/deterministic-v1";

type PromptTrip = { days: number; dailyTimeBudgetMinutes: number };
type PromptDestination = { alias: string; name: string };
type PromptExperience = {
  alias: string;
  title: string;
  category: string;
  durationMinutes: number;
  destination?: string;
};

function section<T>(prompt: string, heading: string): T {
  const line = prompt.split("\n\n").find((block) => block.startsWith(`${heading}:\n`));
  if (!line) throw new Error(`mock model: missing ${heading} section`);
  return JSON.parse(line.slice(heading.length + 2)) as T;
}

export function createMockItineraryModel(): ItineraryModel {
  return {
    id: MOCK_MODEL_ID,
    async generate({ prompt }) {
      const trip = section<PromptTrip>(prompt, "Trip");
      const destinations = section<PromptDestination[]>(prompt, "Destinations");
      let experiences = section<PromptExperience[]>(prompt, "Experiences").filter(
        (e) => e.durationMinutes < 1440 && e.destination,
      );
      if (prompt.includes("Previous itinerary (revise it)")) {
        experiences = [...experiences].reverse();
      }

      const used = new Set<string>();
      const days: ItineraryDraft["days"] = [];
      for (let day = 1; day <= trip.days; day++) {
        const base =
          destinations.find((d) =>
            experiences.some((e) => e.destination === d.alias && !used.has(e.alias)),
          ) ?? destinations[0];
        if (!base) throw new Error("mock model: no destinations");
        let minutes = 0;
        const items: ItineraryDraft["days"][number]["items"] = [];
        for (const e of experiences) {
          if (items.length >= 3 || used.has(e.alias) || e.destination !== base.alias) continue;
          if (minutes + e.durationMinutes > trip.dailyTimeBudgetMinutes) continue;
          used.add(e.alias);
          minutes += e.durationMinutes;
          items.push({
            experience: e.alias,
            timeOfDay:
              items.length === 0 ? "morning" : items.length === 1 ? "afternoon" : "evening",
            rationale: `A ${e.category.replaceAll("_", " ")} experience in ${base.name}.`,
          });
        }
        days.push({ day, base: base.alias, items });
      }

      const draft: ItineraryDraft = {
        title: "Mock itinerary",
        summary: "Deterministic test itinerary built from the listed experiences.",
        days,
        cautions: ["Check permit requirements and road conditions before travelling."],
      };
      return { draft, model: MOCK_MODEL_ID, usage: { inputTokens: 0, outputTokens: 0 } };
    },
  };
}
