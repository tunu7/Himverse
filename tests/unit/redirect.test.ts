import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "@/lib/redirect";

describe("safeRedirectPath", () => {
  it.each(["/account", "/provider?tab=experiences", "/explore#top"])("allows %s", (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "account",
    "/\u0000x",
    "",
    undefined,
    42,
    `/${"a".repeat(600)}`,
  ])("rejects %j", (candidate) => {
    expect(safeRedirectPath(candidate)).toBe("/account");
  });

  it("uses the supplied fallback", () => {
    expect(safeRedirectPath("//x", "/")).toBe("/");
  });
});
