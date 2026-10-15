import { describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors";

import { ModelError, type ItineraryModel } from "@/server/itineraries/model/types";
import {
  GENERATION_LIMITS,
  MODEL_TIMEOUT_MS,
  type GenerationLogEntry,
  runItineraryGeneration,
  SaveConflictError,
  type SaveVersionInput,
  toAliasedDraft,
} from "@/server/itineraries/pipeline";
import { buildAliases } from "@/server/itineraries/prompt";
import type { Candidates, ItineraryDraft } from "@/server/itineraries/schemas";

import { candidates, D1, E, prefs } from "./itinerary-fixtures";

const good: ItineraryDraft = {
  title: "Ziro and Tawang",
  summary: "Two days.",
  cautions: ["Check permits."],
  days: [
    { day: 1, base: "D1", items: [{ experience: "E1", timeOfDay: "morning", rationale: "Walk." }] },
    {
      day: 2,
      base: "D2",
      items: [{ experience: "E4", timeOfDay: "morning", rationale: "Prayers." }],
    },
  ],
};

function scriptedModel(...steps: Array<unknown | Error>): ItineraryModel & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    id: "test/model",
    prompts,
    async generate(request) {
      prompts.push(request.prompt);
      const step = steps.shift();
      if (step instanceof Error) throw step;
      return { draft: step, model: "test/model", usage: { inputTokens: 100, outputTokens: 50 } };
    },
  };
}

function deps(
  model: ItineraryModel,
  overrides: Partial<Parameters<typeof runItineraryGeneration>[1]> = {},
) {
  const saved: SaveVersionInput[] = [];
  const logs: GenerationLogEntry[] = [];
  const retrieve = vi.fn(async () => candidates);
  const reserve = vi.fn(async () => 42);
  return {
    saved,
    logs,
    retrieve,
    reserve,
    deps: {
      model,
      retrieve,
      reserve,
      controls: { enabled: true, globalDailyLimit: 300 },
      save: async (input: SaveVersionInput) => {
        saved.push(input);
        return {
          itineraryId: "it-1",
          versionId: "v-1",
          versionNumber: 1,
          estimatedTotalMinor: 300_000,
          unpricedItemCount: 0,
        };
      },
      finish: async (entry: GenerationLogEntry) => {
        logs.push(entry);
      },
      clock: (() => {
        let t = 0;
        return () => (t += 1000);
      })(),
      ...overrides,
    },
  };
}

const request = { prefs: prefs(), kind: "generate" as const, itineraryId: null };

describe("runItineraryGeneration", () => {
  it("saves a validated plan with server-resolved ids and logs success", async () => {
    const model = scriptedModel(good);
    const t = deps(model);
    const result = await runItineraryGeneration(request, t.deps);
    expect(result.versionNumber).toBe(1);
    expect(t.saved[0]?.plan.days[0]?.items[0]?.experienceId).toBe(E(1));
    expect(t.saved[0]).toMatchObject({
      schemaVersion: "itinerary.v2",
      promptVersion: "itinerary-v3",
      travelers: 2,
    });
    expect(t.logs).toEqual([
      expect.objectContaining({
        outcome: "succeeded",
        itineraryId: "it-1",
        inputTokens: 100,
        outputTokens: 50,
      }),
    ]);
  });

  it("narrows the model's output schema to the trip length and retrieved aliases", async () => {
    let constraints: unknown;
    const model: ItineraryModel = {
      id: "test/model",
      async generate(req) {
        constraints = req.constraints;
        return { draft: good, model: "test/model", usage: {} };
      },
    };
    await runItineraryGeneration(request, deps(model).deps);
    const aliases = buildAliases(candidates);
    expect(constraints).toEqual({
      days: 2,
      destinations: [...aliases.destinations.keys()],
      experiences: [...aliases.experiences.keys()],
      stays: [],
      transport: [],
    });
  });

  it("uses the model's own timeout when it sets one (slow local models), else the default", async () => {
    const timeouts: number[] = [];
    const recording = (timeoutMs?: number): ItineraryModel => ({
      id: "test/model",
      timeoutMs,
      async generate(req) {
        timeouts.push(req.timeoutMs);
        return { draft: good, model: "test/model", usage: {} };
      },
    });
    await runItineraryGeneration(request, deps(recording(180_000)).deps);
    await runItineraryGeneration(request, deps(recording()).deps);
    expect(timeouts).toEqual([180_000, MODEL_TIMEOUT_MS]);
  });

  it("reserves a generation with the platform cap before calling the model, and passes it to save and finish", async () => {
    const model = scriptedModel(good);
    const t = deps(model);
    await runItineraryGeneration({ ...request, itineraryId: "it-9" }, t.deps);
    expect(t.reserve).toHaveBeenCalledWith({ itineraryId: "it-9", globalDailyLimit: 300 });
    expect(t.saved[0]?.generationId).toBe(42);
    expect(t.logs[0]?.generationId).toBe(42);
  });

  it("refuses without calling the model when the reservation is over a limit", async () => {
    const model = scriptedModel(good);
    const t = deps(model, {
      reserve: async () => {
        throw new AppError("RATE_LIMITED", `limit ${GENERATION_LIMITS.perHour} per hour`);
      },
    });
    await expect(runItineraryGeneration(request, t.deps)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect(model.prompts).toHaveLength(0);
    expect(t.saved).toHaveLength(0);
  });

  it("the kill switch stops generation before any reservation, retrieval or model call", async () => {
    const model = scriptedModel(good);
    const t = deps(model, { controls: { enabled: false, globalDailyLimit: 300 } });
    await expect(runItineraryGeneration(request, t.deps)).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
      message: expect.stringMatching(/temporarily unavailable/),
    });
    expect(t.reserve).not.toHaveBeenCalled();
    expect(t.retrieve).not.toHaveBeenCalled();
    expect(model.prompts).toHaveLength(0);
  });

  it("does not call the model or invent anything when inventory is empty", async () => {
    const model = scriptedModel(good);
    const empty: Candidates = {
      experiences: [],
      destinations: [],
      stays: [],
      transport: [],
      widened: false,
    };
    const t = deps(model, { retrieve: async () => empty });
    await expect(runItineraryGeneration(request, t.deps)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(model.prompts).toHaveLength(0);
    expect(t.reserve).not.toHaveBeenCalled();
    expect(t.saved).toHaveLength(0);
  });

  it("reports a model timeout without saving and logs it", async () => {
    const t = deps(scriptedModel(new ModelError("timeout")));
    await expect(runItineraryGeneration(request, t.deps)).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
      message: expect.stringMatching(/too long/),
    });
    expect(t.saved).toHaveLength(0);
    expect(t.logs[0]).toMatchObject({ outcome: "failed_timeout", errorCode: "timeout" });
  });

  it("reports a provider outage without saving", async () => {
    const t = deps(scriptedModel(new ModelError("unavailable")));
    await expect(runItineraryGeneration(request, t.deps)).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
    });
    expect(t.logs[0]).toMatchObject({ outcome: "failed_upstream" });
  });

  it("repairs malformed output once, then succeeds", async () => {
    const model = scriptedModel({ nonsense: true }, good);
    const t = deps(model);
    await runItineraryGeneration(request, t.deps);
    expect(model.prompts).toHaveLength(2);
    expect(model.prompts[1]).toMatch(/did not match the required JSON format/);
    expect(t.logs[0]).toMatchObject({ outcome: "succeeded", inputTokens: 200 });
  });

  it("gives up after one repair when output stays ungrounded (hallucinated ids)", async () => {
    const hallucinated = {
      ...good,
      days: [
        { day: 1, base: "D1", items: [{ experience: "E77", timeOfDay: "morning", rationale: "" }] },
        good.days[1]!,
      ],
    };
    const model = scriptedModel(hallucinated, hallucinated);
    const t = deps(model);
    await expect(runItineraryGeneration(request, t.deps)).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
    });
    expect(model.prompts[1]).toMatch(/E77 is not in the list/);
    expect(t.saved).toHaveLength(0);
    expect(t.logs[0]).toMatchObject({ outcome: "failed_validation", errorCode: "invalid_plan" });
  });

  it("explains an unfixable budget with the computed minimum", async () => {
    const model = scriptedModel(good, good);
    const t = deps(model);
    await expect(
      runItineraryGeneration({ ...request, prefs: prefs({ budgetMaxMinor: 100_000 }) }, t.deps),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      message: expect.stringMatching(/₹3000/), // (100000 + 50000) x 2 travellers, from DB prices
      fieldErrors: { budgetRupees: expect.any(Array) },
    });
    expect(t.logs[0]).toMatchObject({ errorCode: "over_budget" });
  });

  it("maps inventory hidden between retrieval and save to a conflict", async () => {
    const t = deps(scriptedModel(good), {
      save: async () => {
        throw new SaveConflictError("one or more experiences are not available");
      },
    });
    await expect(runItineraryGeneration(request, t.deps)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(t.logs[0]).toMatchObject({ outcome: "failed_save", errorCode: "inventory_changed" });
  });

  it("never lets a logging failure hide the result", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = deps(scriptedModel(good), {
      finish: async () => {
        throw Object.assign(new Error("db down"), { code: "XX000" });
      },
    });
    await expect(runItineraryGeneration(request, t.deps)).resolves.toMatchObject({
      versionNumber: 1,
    });
  });

  it("sends refinements with the previous plan re-expressed in fresh aliases", async () => {
    const model = scriptedModel(good);
    const t = deps(model);
    const previous = {
      title: "Old",
      summary: "",
      cautions: [],
      days: [
        {
          dayNumber: 1,
          date: "2026-11-01",
          destinationId: D1,
          note: "",
          items: [
            { experienceId: E(2), destinationId: D1, timeOfDay: "morning" as const, rationale: "" },
          ],
          stay: null,
          transport: null,
        },
        {
          dayNumber: 2,
          date: "2026-11-02",
          destinationId: D1,
          note: "",
          items: [
            {
              experienceId: "99999999-9999-4999-8999-999999999999",
              destinationId: D1,
              timeOfDay: "morning" as const,
              rationale: "",
            },
          ],
          stay: null,
          transport: null,
        },
      ],
    };
    await runItineraryGeneration(
      {
        ...request,
        kind: "refine",
        itineraryId: "it-1",
        refinement: { previous, request: "Add food" },
      },
      t.deps,
    );
    expect(model.prompts[0]).toMatch(/Requested changes: Add food/);
    const aliased = toAliasedDraft(previous, buildAliases(candidates));
    expect(aliased.days[0]?.items).toEqual([
      { experience: "E2", timeOfDay: "morning", rationale: "" },
    ]);
    // An experience no longer retrievable is dropped, never passed through by id.
    expect(aliased.days[1]?.items).toEqual([]);
    expect(model.prompts[0]).not.toContain("99999999-9999");
  });
});
