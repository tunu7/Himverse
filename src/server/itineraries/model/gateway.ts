import "server-only";

import { createGateway, gateway, type LanguageModel } from "ai";

import { createAiSdkItineraryModel } from "./ai-sdk";
import type { ItineraryModel } from "./types";

/** Vercel AI Gateway (AI_PROVIDER=gateway). Model ids are "provider/model". */
export function createGatewayItineraryModel(options: {
  modelId: string;
  apiKey?: string | undefined;
  timeoutMs?: number | undefined;
  languageModel?: LanguageModel;
}): ItineraryModel {
  const languageModel =
    options.languageModel ??
    (options.apiKey
      ? createGateway({ apiKey: options.apiKey })(options.modelId)
      : gateway(options.modelId));
  return createAiSdkItineraryModel({ ...options, languageModel });
}
