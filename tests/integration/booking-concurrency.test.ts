import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLocalPool, runAsUser } from "./local-db";

/**
 * Booking concurrency against the LOCAL Supabase database, using genuinely
 * parallel connections (pgTAP runs in a single session and can't do this).
 */
const pool = createLocalPool();
const run = randomUUID().slice(0, 8);
const ids = {
  provider: randomUUID(),
  owner: randomUUID(),
  destination: randomUUID(),
  experience: randomUUID(),
  travelers: Array.from({ length: 6 }, () => randomUUID()),
};

const asUser = (userId: string, sql: string, params: unknown[] = []) =>
  runAsUser(pool, userId, sql, params, userId === ids.owner ? "aal2" : "aal1");

async function newSlot(capacity: number): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "insert into public.availability_slots (experience_id, starts_on, capacity) values ($1, private.today_ist() + 30 + $2::int, $3) returning id",
    [ids.experience, Math.floor(Math.random() * 300), capacity],
  );
  return rows[0]!.id;
}

const REQUEST_SQL = "select * from public.request_booking($1, $2, 0, '+91 98765 43210', '', $3)";
const request = (slotId: string, key: string, adults = 1) =>
  [REQUEST_SQL, [slotId, adults, key]] as const;

beforeAll(async () => {
  const users = [ids.owner, ...ids.travelers];
  await pool.query(
    // One account type each (ADR-0007): the first user runs the business, the rest travel.
    `insert into auth.users (id, email, aud, role, raw_user_meta_data)
     select u, 'concurrency-' || $2 || '-' || ordinality || '@example.test', 'authenticated', 'authenticated',
       jsonb_build_object('account_type', case when ordinality = 1 then 'partner' else 'traveller' end)
     from unnest($1::uuid[]) with ordinality as t(u, ordinality)`,
    [users, run],
  );
  await pool.query(
    "insert into public.providers (id, slug, display_name, status, verified_at) values ($1, $2, 'Concurrency Co', 'verified', now())",
    [ids.provider, `concurrency-${run}`],
  );
  await pool.query("insert into public.provider_members (provider_id, user_id) values ($1, $2)", [
    ids.provider,
    ids.owner,
  ]);
  await pool.query(
    "insert into public.destinations (id, slug, name, district, is_published) values ($1, $2, 'Concurrency Town', 'Tawang', true)",
    [ids.destination, `concurrency-${run}`],
  );
  await pool.query(
    `insert into public.experiences (id, provider_id, destination_id, slug, title, category, duration_minutes, price_from_minor, status)
     values ($1, $2, $3, $4, 'Concurrency walk', 'culture', 60, 10000, 'published')`,
    [ids.experience, ids.provider, ids.destination, `concurrency-walk-${run}`],
  );
});

afterAll(async () => {
  await pool.query("delete from public.bookings where experience_id = $1", [ids.experience]);
  await pool.query("delete from public.availability_slots where experience_id = $1", [
    ids.experience,
  ]);
  await pool.query("delete from public.experiences where id = $1", [ids.experience]);
  await pool.query("delete from public.destinations where id = $1", [ids.destination]);
  await pool.query("delete from public.providers where id = $1", [ids.provider]);
  await pool.query("delete from auth.users where id = any($1::uuid[])", [
    [ids.owner, ...ids.travelers],
  ]);
  await pool.end();
});

describe("booking concurrency (parallel connections)", () => {
  it("10 simultaneous submissions with one idempotency key create exactly one booking", async () => {
    const slot = await newSlot(10);
    const key = randomUUID();
    const [sql, params] = request(slot, key);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => asUser(ids.travelers[0]!, sql, [...params])),
    );

    expect(results.every((r) => r.ok)).toBe(true);
    const bookingIds = new Set(
      results.flatMap((r) => (r.ok ? r.rows.map((row) => row.booking_id) : [])),
    );
    expect(bookingIds.size).toBe(1);
    const { rows } = await pool.query(
      "select count(*)::int as n from public.bookings where idempotency_key = $1",
      [key],
    );
    expect(rows[0].n).toBe(1);
    const events = await pool.query(
      "select count(*)::int as n from public.booking_events e join public.bookings b on b.id = e.booking_id where b.idempotency_key = $1",
      [key],
    );
    expect(events.rows[0].n).toBe(1);
  });

  it("simultaneous submissions with different keys for the same date create one active booking", async () => {
    const slot = await newSlot(10);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => {
        const [sql, params] = request(slot, randomUUID());
        return asUser(ids.travelers[1]!, sql, [...params]);
      }),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).map((r) => (r.ok ? null : r.code))).toEqual(
      Array(5).fill("23505"),
    );
  });

  it("parallel confirmations never exceed capacity", async () => {
    const slot = await newSlot(3);
    const bookingIds: string[] = [];
    for (const traveler of ids.travelers) {
      const [sql, params] = request(slot, randomUUID());
      const result = await asUser(traveler, sql, [...params]);
      expect(result.ok).toBe(true);
      if (result.ok) bookingIds.push(result.rows[0].booking_id);
    }

    const confirmations = await Promise.all(
      bookingIds.map((id) =>
        asUser(
          ids.owner,
          "select public.respond_to_booking($1, 'confirmed', 10000, null) as status",
          [id],
        ),
      ),
    );
    expect(confirmations.filter((r) => r.ok)).toHaveLength(3);
    expect(confirmations.filter((r) => !r.ok).every((r) => !r.ok && r.code === "55000")).toBe(true);

    const { rows } = await pool.query(
      "select seats_confirmed, capacity, (select count(*)::int from public.bookings where slot_id = $1 and status = 'confirmed') as confirmed from public.availability_slots where id = $1",
      [slot],
    );
    expect(rows[0]).toEqual({ seats_confirmed: 3, capacity: 3, confirmed: 3 });
  });
});
