/**
 * Structured server logging: one JSON line per event, so Vercel log search and
 * drains can filter by `event` and `level`. Sensitive-looking fields are
 * redacted by name as a backstop; callers should still log IDs and codes, not
 * personal data (docs/engineering/OBSERVABILITY.md).
 */

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const SENSITIVE_KEY = /pass|secret|token|cookie|authorization|api.?key|email|phone|prompt/i;
const MAX_DEPTH = 4;
const MAX_STRING = 500;

export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === "string")
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: redact(value.message, depth + 1) };
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[redacted]" : redact(v, depth + 1),
    ]),
  );
}

function write(level: Level, event: string, fields: Fields = {}) {
  const line = JSON.stringify({
    level,
    event,
    time: new Date().toISOString(),
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
    ...(redact(fields) as Fields),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const logger = {
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};
