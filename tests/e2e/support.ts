import { execFileSync } from "node:child_process";

import { expect, type Page } from "@playwright/test";

export const PASSWORD = "correct-horse-battery";

/**
 * Runs SQL as the database owner against the LOCAL stack only (test setup, e.g.
 * granting provider membership the way an operator would). The CLI prints a
 * table without --output-format, a bare JSON array with it, and { rows } in
 * AI-agent sessions; accept both JSON shapes.
 */
export function localSql(sql: string): unknown[] {
  const out = execFileSync(
    "npx",
    ["supabase", "db", "query", "--local", "--output-format", "json", sql],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  const parsed: unknown = JSON.parse(out);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { rows?: unknown }).rows)) {
    return (parsed as { rows: unknown[] }).rows;
  }
  throw new Error(`Unexpected supabase db query output: ${out.slice(0, 200)}`);
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

export async function signUp(page: Page, email: string, name: string) {
  await page.context().clearCookies();
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

export async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

/** Signed-in user's id, read from /account (as the admin runbook does). */
export async function currentUserId(page: Page): Promise<string> {
  await page.goto("/account");
  const id =
    (await page.getByTestId("account-id").filter({ visible: true }).textContent())?.trim() ?? "";
  expect(id).toMatch(UUID);
  return id;
}
