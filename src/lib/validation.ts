import { z } from "zod";

import { AppError } from "@/lib/errors";

/**
 * Parses FormData (or a plain object) with `schema`, throwing a
 * VALIDATION_FAILED AppError with per-field messages on failure.
 */
export function parseInput<T extends z.ZodType>(
  schema: T,
  input: FormData | Record<string, unknown>,
): z.infer<T> {
  const raw =
    input instanceof FormData
      ? Object.fromEntries(
          // React adds `$ACTION_*` fields for progressive enhancement; they are
          // framework plumbing, not user input, and would fail strict schemas.
          [...input.entries()].filter(([key]) => !key.startsWith("$ACTION")),
        )
      : input;
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new AppError("VALIDATION_FAILED", "Please check the highlighted fields.", {
      fieldErrors: z.flattenError(result.error).fieldErrors as Record<string, string[]>,
    });
  }
  return result.data;
}
