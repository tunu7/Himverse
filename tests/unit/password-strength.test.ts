import { describe, expect, it } from "vitest";

import { passwordStrength } from "@/lib/password-strength";

describe("passwordStrength", () => {
  it.each([
    ["", 0],
    ["short1!", 0],
    ["password", 0],
    ["12345678", 0],
    ["aaaaaaaaaaaa", 1],
    ["abcdefgh", 1],
    ["correct-horse", 2],
    ["Correct-Horse-9", 4],
    ["Tr1ck!er-Than-You", 4],
  ] as const)("%j scores %i", (password, score) => {
    expect(passwordStrength(password).score).toBe(score);
  });
});
