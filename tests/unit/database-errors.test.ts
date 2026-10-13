import { describe, expect, it } from "vitest";

import { toAppError } from "@/lib/supabase/errors";

describe("toAppError", () => {
  it.each([
    ["42501", "FORBIDDEN"],
    ["P0002", "NOT_FOUND"],
    ["PGRST116", "NOT_FOUND"],
    ["55000", "CONFLICT"],
    ["23505", "CONFLICT"],
    ["22023", "VALIDATION_FAILED"],
    ["23514", "VALIDATION_FAILED"],
    ["23503", "VALIDATION_FAILED"],
    ["54000", "RATE_LIMITED"],
    ["XX000", "INTERNAL"],
  ])("maps %s to %s", (code, expected) => {
    expect(toAppError({ code, message: "x" }, "fallback").code).toBe(expected);
  });

  it("never exposes the database message to clients", () => {
    const error = toAppError(
      {
        code: "23505",
        message: 'duplicate key value violates unique constraint "providers_slug_key"',
      },
      "fallback",
    );
    expect(error.message).not.toContain("providers_slug_key");
    expect(error.cause).toMatchObject({ code: "23505" });
  });
});
