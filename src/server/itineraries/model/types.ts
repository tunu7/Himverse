import type { DraftConstraints } from "@/server/itineraries/schemas";

/** Replaceable model boundary (ADR-0003). The pipeline depends only on this. */
export type ModelRequest = {
  system: string;
  prompt: string;
  /** Narrows the output schema sent to the model to this request. */
  constraints?: DraftConstraints;
  maxOutputTokens: number;
  timeoutMs: number;
};

export type ModelResult = {
  /** Unvalidated by the pipeline's grounding rules; schema-checked by the adapter. */
  draft: unknown;
  model: string;
  usage: { inputTokens?: number | undefined; outputTokens?: number | undefined };
};

export type ModelErrorKind = "timeout" | "unavailable" | "invalid_output";

export class ModelError extends Error {
  override readonly name = "ModelError";
  constructor(
    readonly kind: ModelErrorKind,
    options?: { cause?: unknown },
  ) {
    super(`Model call failed: ${kind}`, options);
  }
}

export interface ItineraryModel {
  readonly id: string;
  /** Per-call timeout this model needs; the pipeline default applies when unset. */
  readonly timeoutMs?: number | undefined;
  generate(request: ModelRequest): Promise<ModelResult>;
}
