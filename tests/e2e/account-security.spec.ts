import { expect, type Page, test } from "@playwright/test";

import { PASSWORD, signIn, signUp, uniqueEmail } from "./support";

// Phase 2 account security: password reset (through the real email, read from the
// local mail catcher), change password, and two-step login for partners.

const MAILPIT = "http://127.0.0.1:54324";
const NEW_PASSWORD = "Fresh-Glacier-2026";

type MailpitMessage = { ID: string; Subject: string };

/** The newest email to `to`, polling the local mail catcher (Mailpit). */
async function latestEmail(to: string): Promise<{ html: string; text: string }> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await res.json()) as { messages: MailpitMessage[] };
    const first = messages[0];
    if (first) {
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${first.ID}`)).json()) as {
        HTML: string;
        Text: string;
      };
      return { html: message.HTML, text: message.Text };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No email arrived for ${to}`);
}

/** The Auth server's verify link, sent back to this test server. */
function resetLinkFrom(email: { html: string; text: string }, baseURL: string): string {
  const match = `${email.text}\n${email.html}`.match(
    /https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/,
  );
  if (!match) throw new Error("No verify link in the email");
  const link = new URL(match[0].replaceAll("&amp;", "&"));
  // The app is built with the dev SITE_URL; point the redirect at this server.
  link.searchParams.set("redirect_to", `${baseURL}/auth/reset`);
  return link.toString();
}

async function signInWith(page: Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("forgot password: email link → new password → old one stops working", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const email = uniqueEmail("forgetful");
  await signUp(page, email, "Forgetful");
  await page.context().clearCookies();

  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel("Email").filter({ visible: true }).fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account uses that email");

  // Same browser (the link is bound to it), straight from the email.
  await page.goto(resetLinkFrom(await latestEmail(email), baseURL!));
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel("New password (at least 8 characters)").fill(NEW_PASSWORD);
  await expect(page.getByTestId("password-strength")).toHaveText(/Good|Strong/);
  await page.getByLabel("Repeat new password").fill("Different-Password-1");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByText("The passwords don't match.")).toBeVisible();
  await page.getByLabel("New password (at least 8 characters)").fill(NEW_PASSWORD);
  await page.getByLabel("Repeat new password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page).toHaveURL(/\/account\?password=updated$/);

  await signInWith(page, email, PASSWORD);
  await expect(
    page.getByRole("alert").filter({ hasText: "Email or password is incorrect." }),
  ).toBeVisible();
  await signInWith(page, email, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/account$/);
});

test("the reset page refuses sessions that didn't come from a reset link", async ({ page }) => {
  await signUp(page, uniqueEmail("not-reset"), "Not Reset");
  await page.goto("/reset-password");
  await expect(page.getByRole("link", { name: "Request a new reset link" })).toBeVisible();
  await expect(page.getByLabel("New password (at least 8 characters)")).toHaveCount(0);
});

test("change password from account settings checks the current one", async ({ page }) => {
  const email = uniqueEmail("changer");
  await signUp(page, email, "Changer");
  await page.goto("/account");
  await page.getByLabel("Current password").fill("not-my-password");
  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Repeat new password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("That isn't your current password.")).toBeVisible();

  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Repeat new password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Password changed." })).toBeVisible();

  await signInWith(page, email, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/account$/);
});

test("partners need the second step: portal blocked until a valid code", async ({ page }) => {
  test.setTimeout(90_000);
  const email = uniqueEmail("mfa-partner");
  await signUp(page, email, "MFA Partner", "partner");
  await page.goto("/provider/account");
  await expect(page.getByTestId("two-step-status").filter({ visible: true })).toContainText(
    "On (authenticator app)",
  );

  // Password alone isn't enough.
  await signInWith(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/mfa\/verify/);
  await page.goto("/provider/bookings");
  await expect(page).toHaveURL(/\/mfa\/verify\?next=%2Fprovider%2Fbookings$/);
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText(/That code didn.t work/)).toBeVisible();

  // The right code lets them in.
  await signIn(page, email, "partner");
  await page.goto("/provider/bookings");
  await expect(page).toHaveURL(/\/provider\/bookings$/);
});

test("sign-up shows a password strength meter and a show/hide toggle", async ({ page }) => {
  await page.goto("/sign-up");
  const field = page.getByLabel("Password (at least 8 characters)");
  await field.fill("password");
  await expect(page.getByTestId("password-strength")).toHaveText("Too weak");
  await field.fill("Tr1ck!er-Than-You");
  await expect(page.getByTestId("password-strength")).toHaveText("Strong");
  await expect(field).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(field).toHaveAttribute("type", "text");
});
