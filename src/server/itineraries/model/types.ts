/** Replaceable model boundary (ADR-0003). The pipeline depends only on this. */
export type ModelRequest = {
  system: string;
  prompt: string;
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
  generate(request: ModelRequest): Promise<ModelResult>;
}
