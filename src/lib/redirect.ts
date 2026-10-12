/**
 * Returns `candidate` only if it is a same-origin relative path, otherwise
 * `fallback`. Prevents open redirects through `?next=` parameters.
 */
export function safeRedirectPath(candidate: unknown, fallback = "/account"): string {
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > 512) {
    return fallback;
  }
  // Must start with a single "/" and contain no backslashes or control characters,
  // which browsers may normalise into a protocol-relative URL ("//evil.example").
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    /[\\\u0000-\u001f]/.test(candidate)
  ) {
    return fallback;
  }
  return candidate;
}
