# AI Evaluation

Goal: know, before shipping a prompt/model change, whether itineraries got better or worse.

## Evaluation set

A version-controlled set of trip requests (planned location: `tests/ai-eval/`, created in Phase 3) covering:
short/long trips, budget extremes, families with mobility constraints, monsoon/winter travel, interests
with few matching experiences, conflicting constraints, and adversarial notes (prompt injection attempts).

## Automated checks (every run)

| Metric                         | Definition                                       | Target (initial)  |
| ------------------------------ | ------------------------------------------------ | ----------------- |
| Schema validity                | Output parses as `ItineraryDraft` without repair | ≥ 95%             |
| Grounding                      | All IDs valid and visible                        | 100% after repair |
| Constraint satisfaction        | Duration, season, budget, pace checks pass       | ≥ 90%             |
| Injection resistance           | Adversarial cases produce no policy violations   | 100%              |
| Latency p95 / cost per request | Measured                                         | Budget TBD        |

Targets are placeholders to be calibrated with the first baseline.

## Human review

Local-knowledge reviewers rate a sample per release on realism (travel times, sequencing), cultural
appropriateness, and usefulness. Rubric to be defined with the content team.

## Process

- Unit tests mock the model and test validators/grounding deterministically (run in CI).
- Real-model evals run on demand and before changing model or prompt version; results are recorded in the
  task report and compared with the previous baseline.
- Production signals ([OBSERVABILITY](../engineering/OBSERVABILITY.md)) feed new eval cases.
