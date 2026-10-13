import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLocalPool, runAsUser } from "./local-db";

/**
 * Itinerary generation limits under real parallelism (security review M1):
 * reservations are serialised per user, so simultaneous requests can't all
 * pass the limit check before any of them is counted.
 */
const pool = createLocalPool();
const userId = randomUUID();

beforeAll(async () => {
  await pool.query(
    "insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')",
    [userId, `reservations-${userId.slice(0, 8)}@example.test`],
  );
});

afterAll(async () => {
  await pool.query("delete from public.itinerary_generations where user_id = $1", [userId]);
  await pool.query("delete from auth.users where id = $1", [userId]);
  await pool.end();
});

describe("itinerary generation reservations (parallel connections)", () => {
  it("15 simultaneous reservations by one user: exactly 10 succeed, 5 are rate limited", async () => {
    const results = await Promise.all(
      Array.from({ length: 15 }, () =>
        runAsUser(pool, userId, "select public.begin_itinerary_generation(null, null) as id"),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(10);
    expect(results.filter((r) => !r.ok).map((r) => (r.ok ? null : r.code))).toEqual(
      Array(5).fill("54000"),
    );
    const { rows } = await pool.query(
      "select count(*)::int as n from public.itinerary_generations where user_id = $1 and outcome = 'pending'",
      [userId],
    );
    expect(rows[0].n).toBe(10);
  });
});
