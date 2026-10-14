import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createOllamaItineraryModel } = await import("@/server/itineraries/model/ollama");

const validDraft = {
  title: "Ziro weekend",
  summary: "Two calm days.",
  days: [
    { day: 1, base: "D1", items: [{ experience: "E1", timeOfDay: "morning", rationale: "Nice." }] },
  ],
  cautions: [],
};

function chatCompletion(content: string) {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-1",
      object: "chat.completion",
      created: 0,
      model: "qwen2.5:3b",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

const request = { system: "s", prompt: "p", maxOutputTokens: 1000, timeoutMs: 5000 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ollama itinerary model adapter", () => {
  it("calls the OpenAI-compatible endpoint with the JSON schema and returns the draft", async () => {
    const fetchMock = vi.fn(async () => chatCompletion(JSON.stringify(validDraft)));
    vi.stubGlobal("fetch", fetchMock);

    const model = createOllamaItineraryModel({
      modelId: "qwen2.5:3b",
      baseUrl: "http://127.0.0.1:11434/v1",
      timeoutMs: 120_000,
    });
    expect(model.id).toBe("ollama/qwen2.5:3b");
    expect(model.timeoutMs).toBe(120_000);

    const result = await model.generate(request);
    expect(result).toEqual({
      draft: validDraft,
      model: "ollama/qwen2.5:3b",
      usage: { inputTokens: 50, outputTokens: 20 },
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:11434/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("qwen2.5:3b");
    expect(body.response_format).toMatchObject({ type: "json_schema" });
  });

  it("asks for exactly N days and only known aliases, but leaves alias errors to validation", async () => {
    const offList = {
      ...validDraft,
      days: [
        { ...validDraft.days[0], items: [{ ...validDraft.days[0]!.items[0]!, experience: "E9" }] },
      ],
    };
    const fetchMock = vi.fn(async () => chatCompletion(JSON.stringify(offList)));
    vi.stubGlobal("fetch", fetchMock);
    const model = createOllamaItineraryModel({
      modelId: "qwen2.5:3b",
      baseUrl: "http://127.0.0.1:11434/v1",
    });

    const result = await model.generate({
      ...request,
      constraints: { days: 1, destinations: ["D1"], experiences: ["E1", "E2"] },
    });
    // Accepted by the adapter so validate.ts can explain the problem in the repair prompt.
    expect(result.draft).toEqual(offList);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const schema = JSON.parse(String(init.body)).response_format.json_schema.schema;
    expect(schema.properties.days).toMatchObject({ minItems: 1, maxItems: 1 });
    expect(schema.properties.days.items.properties.base.enum).toEqual(["D1"]);
    expect(schema.properties.days.items.properties.items.items.properties.experience.enum).toEqual([
      "E1",
      "E2",
    ]);
  });

  it("maps an unreachable Ollama server to unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const model = createOllamaItineraryModel({
      modelId: "qwen2.5:3b",
      baseUrl: "http://127.0.0.1:11434/v1",
    });
    await expect(model.generate(request)).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("maps non-JSON model output to invalid_output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => chatCompletion("Sure! Here is your itinerary.")),
    );
    const model = createOllamaItineraryModel({
      modelId: "qwen2.5:3b",
      baseUrl: "http://127.0.0.1:11434/v1",
    });
    await expect(model.generate(request)).rejects.toMatchObject({ kind: "invalid_output" });
  });
});
