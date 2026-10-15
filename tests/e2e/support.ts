import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";

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

/** One type per account (ADR-0007); each lands in its own area. */
export type AccountKind = "traveller" | "partner";
const HOME: Record<AccountKind, RegExp> = { traveller: /\/account$/, partner: /\/provider$/ };

// --- Two-step login (TOTP, RFC 6238), as an authenticator app computes it ---------

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of input.replace(/=+$/, "").toUpperCase()) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error(`Invalid base32 character: ${char}`);
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totp(secret: string, now = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

/** Authenticator secrets of accounts created in this test run, by email. */
const secrets = new Map<string, string>();

/** The current authenticator code for an account set up in this run. */
export function currentTotp(email: string): string {
  const secret = secrets.get(email);
  if (!secret) throw new Error(`No authenticator secret recorded for ${email}`);
  return totp(secret);
}

/** On /mfa/setup: scan (read the key), enter the first code, land on `landing`. */
export async function setUpTwoStep(page: Page, email: string, landing: RegExp) {
  await expect(page).toHaveURL(/\/mfa\/setup/);
  await page.getByRole("button", { name: "Set up authenticator app" }).click();
  await page.getByText("Can't scan? Enter this key").click();
  const secret = (await page.getByTestId("totp-secret").textContent())?.trim() ?? "";
  expect(secret).toMatch(/^[A-Z2-7]+=*$/);
  secrets.set(email, secret);
  await page.getByLabel("6-digit code").fill(totp(secret));
  await page.getByRole("button", { name: "Turn on two-step login" }).click();
  await expect(page).toHaveURL(landing);
}

/** On /mfa/verify: enter the current code (waits for a fresh period if it was just used). */
export async function passTwoStep(page: Page, email: string, landing: RegExp) {
  const secret = secrets.get(email);
  if (!secret) throw new Error(`No authenticator secret recorded for ${email}`);
  await expect(page).toHaveURL(/\/mfa\/verify/);
  await page.getByLabel("6-digit code").fill(totp(secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(landing);
}

export async function signUp(
  page: Page,
  email: string,
  name: string,
  as: AccountKind = "traveller",
) {
  await page.context().clearCookies();
  await page.goto(as === "partner" ? "/sign-up?as=partner" : "/sign-up");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: false }).first().fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  // Partners must set up two-step login before using the portal.
  if (as === "partner") await setUpTwoStep(page, email, HOME.partner);
  await expect(page).toHaveURL(HOME[as]);
}

export async function signIn(page: Page, email: string, as: AccountKind = "traveller") {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  if (as === "partner") await passTwoStep(page, email, HOME.partner);
  await expect(page).toHaveURL(HOME[as]);
}

/** Signed-in user's id, read from their area's account page (as the admin runbook does). */
export async function currentUserId(page: Page, as: AccountKind = "traveller"): Promise<string> {
  await page.goto(as === "partner" ? "/provider/account" : "/account/settings");
  const id =
    (await page.getByTestId("account-id").filter({ visible: true }).textContent())?.trim() ?? "";
  expect(id).toMatch(UUID);
  return id;
}
