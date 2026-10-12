import "server-only";

import { getItineraryModel } from "@/server/itineraries/model";
import {
  type GenerationRequest,
  runItineraryGeneration,
  type SavedVersion,
} from "@/server/itineraries/pipeline";
import {
  generationQuota,
  recordGeneration,
  saveItineraryVersion,
} from "@/server/itineraries/repository";
import { retrieveCandidates } from "@/server/itineraries/retrieval";

/** Runs the pipeline for the signed-in user with the configured model and real persistence. */
export function generateItineraryForCurrentUser(request: GenerationRequest): Promise<SavedVersion> {
  return runItineraryGeneration(request, {
    model: getItineraryModel(),
    retrieve: retrieveCandidates,
    save: saveItineraryVersion,
    record: recordGeneration,
    quota: generationQuota,
  });
}
