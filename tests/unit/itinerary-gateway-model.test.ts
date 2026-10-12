import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createGatewayItineraryModel } = await import("@/server/itineraries/model/gateway");
const { ModelError } = await import("@/server/itineraries/model/types");

const usage = {
  inputTokens: { total: 120, noCache: 120, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 80, text: 80, reasoning: undefined },
};

function textModel(text: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: undefined },
      usage,
      warnings: [],
    }),
  });
}

const request = { system: "s", prompt: "p", maxOutputTokens: 1000, timeoutMs: 5000 };

const validDraft = {
  title: "Ziro weekend",
  summary: "Two calm days.",
  days: [
    { day: 1, base: "D1", items: [{ experience: "E1", timeOfDay: "morning", rationale: "Nice." }] },
  ],
  cautions: [],
};

describe("gateway itinerary model adapter", () => {
  it("returns the schema-checked draft, model id and token usage", async () => {
    const model = createGatewayItineraryModel({
      modelId: "anthropic/claude-sonnet-5.5",
      languageModel: textModel(JSON.stringify(validDraft)),
    });
    const result = await model.generate(request);
    expect(result.draft).toEqual(validDraft);
    expect(result.model).toBe("anthropic/claude-sonnet-5.5");
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 80 });
  });

  it("maps unparseable output to invalid_output", async () => {
    const model = createGatewayItineraryModel({
      modelId: "m/x",
      languageModel: textModel("not json {"),
    });
    await expect(model.generate(request)).rejects.toMatchObject({ kind: "invalid_output" });
  });

  it("maps schema-violating output (e.g. a database id instead of an alias) to invalid_output", async () => {
    const bad = {
      ...validDraft,
      days: [
        {
          day: 1,
          base: "D1",
          items: [
            {
              experience: "5eed0000-0000-4000-8000-000000000001",
              timeOfDay: "morning",
              rationale: "",
            },
          ],
        },
      ],
    };
    const model = createGatewayItineraryModel({
      modelId: "m/x",
      languageModel: textModel(JSON.stringify(bad)),
    });
    await expect(model.generate(request)).rejects.toMatchObject({ kind: "invalid_output" });
  });

  it("maps provider failures to unavailable", async () => {
    const model = createGatewayItineraryModel({
      modelId: "m/x",
      languageModel: new MockLanguageModelV4({
        doGenerate: async () => {
          throw new Error("503 from provider");
        },
      }),
    });
    const error = await model.generate(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ModelError);
    expect(error).toMatchObject({ kind: "unavailable" });
  });

  it("maps the SDK timeout to timeout", async () => {
    const model = createGatewayItineraryModel({
      modelId: "m/x",
      languageModel: new MockLanguageModelV4({
        doGenerate: ({ abortSignal }) =>
          new Promise((_, reject) => {
            abortSignal?.addEventListener("abort", () => reject(abortSignal.reason));
          }),
      }),
    });
    const error = await model.generate({ ...request, timeoutMs: 50 }).catch((e: unknown) => e);
    // Surface the real cause name if the mapping is ever wrong.
    expect({
      kind: (error as InstanceType<typeof ModelError>).kind,
      cause: ((error as Error).cause as Error)?.name,
    }).toMatchObject({
      kind: "timeout",
    });
  });
});
