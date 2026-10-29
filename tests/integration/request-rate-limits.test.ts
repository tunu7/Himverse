import { createHash, randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createLocalPool } from "./local-db";

/**
 * Request limits under real parallelism (ADR-0011): the upsert counts every
 * request atomically, so simultaneous requests can't all pass before any of
 * them is counted. Runs as service_role, the only role allowed to count.
 */
const pool = createLocalPool();
const key = createHash("sha256").update(randomUUID()).digest("hex");

async function hit(limit: number): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role service_role");
    const { rows } = await client.query<{ allowed: boolean }>(
      "select allowed from public.hit_rate_limit('sms_send_phone', $1, $2, 3600)",
      [key, limit],
    );
    await client.query("commit");
    return rows[0]?.allowed === true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

afterAll(async () => {
  await pool.query("delete from private.request_rate_limits where key_hash = $1", [key]);
  await pool.end();
});

describe("request limits (parallel connections)", () => {
  it("20 simultaneous requests against a limit of 5: exactly 5 are allowed", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => hit(5)));
    expect(results.filter(Boolean)).toHaveLength(5);
    const { rows } = await pool.query<{ hits: number }>(
      "select hits from private.request_rate_limits where bucket = 'sms_send_phone' and key_hash = $1",
      [key],
    );
    expect(rows[0]?.hits).toBe(20);
  });
});
