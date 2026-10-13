import { Pool } from "pg";

/**
 * Pool for the LOCAL Supabase database only. SUPABASE_DB_URL defaults to the
 * Supabase CLI's documented local default (not a secret; local Docker only).
 * The URL is parsed rather than pattern-matched so a crafted value can't pass
 * the guard while pointing at a hosted project.
 */
export function createLocalPool(max = 20): Pool {
  const raw =
    process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("SUPABASE_DB_URL is not a valid URL.");
  }
  const local =
    (url.protocol === "postgresql:" || url.protocol === "postgres:") &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
    url.port === "54322" &&
    !url.searchParams.has("host") &&
    !url.searchParams.has("hostaddr");
  if (!local) {
    throw new Error(
      "Integration tests only run against the local Supabase database (127.0.0.1:54322).",
    );
  }
  return new Pool({ connectionString: raw, max });
}

/** Runs `sql` in its own connection and transaction as an authenticated user. */
export async function runAsUser(pool: Pool, userId: string, sql: string, params: unknown[] = []) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    const result = await client.query(sql, params);
    await client.query("commit");
    return { ok: true as const, rows: result.rows };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    return { ok: false as const, code: (error as { code?: string }).code };
  } finally {
    client.release();
  }
}
