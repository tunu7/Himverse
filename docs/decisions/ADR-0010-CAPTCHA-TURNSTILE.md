# ADR-0010: CAPTCHA with Cloudflare Turnstile, verified by Supabase Auth

- Status: Accepted
- Date: 2026-10-15
- Deciders: Product owner (chose Turnstile behind a flag), Engineering

## Context

The release checklist requires CAPTCHA on sign-up and sign-in before launch. Our auth calls run on the
server (Server Actions), so Supabase Auth's IP rate limits see Vercel's addresses, not the visitor's
(SECURITY "Known accepted risks"). The per-account attempt limits from the two-step login work don't
cover sign-up, password-reset or resend spam, or credential stuffing across many accounts.

Supabase Auth has built-in CAPTCHA verification for hCaptcha and Cloudflare Turnstile. When it's
enabled, every password sign-in, sign-up, password-reset email and confirmation resend must carry a
token, which Supabase verifies with the provider using the secret stored in the Supabase dashboard.

## Decision

1. **Turnstile, verified by Supabase Auth.** The browser renders the Turnstile widget and the auth
   forms post its token as `captchaToken`. The Server Action passes it to supabase-js
   (`options.captchaToken`), and Supabase verifies it. Our app holds **no CAPTCHA secret**.
2. **Behind a flag.** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public) turns the widget on. When it's unset,
   nothing renders and no token is sent, so behaviour is unchanged (local, CI, E2E).
3. **Every password check carries a token,** because Supabase enforces CAPTCHA on all of them. That
   means sign-in, sign-up, forgot password, resend confirmation, change password (the current-password
   check) and delete account (the password re-check). Two-step codes, Google sign-in and the reset link
   itself don't need one.
4. **No npm dependency.** A small client component (`src/components/captcha-field.tsx`) loads
   Cloudflare's script with explicit rendering, so it works after client-side navigation, and resets
   the single-use token after each submission.
5. **CSP:** `https://challenges.cloudflare.com` is added to `script-src` and `frame-src` only when the
   site key is set at build time.
6. **Errors:** Supabase's `captcha_failed` becomes "Please complete the security check and try again."
   It never counts as a wrong password, and never reveals whether an address exists.

## Alternatives considered

- **hCaptcha:** also supported by Supabase, but it's more intrusive for visitors and the free tier
  shows challenges more often. Turnstile is free and usually invisible.
- **Verifying tokens in our own server code:** adds a secret to our environment and duplicates what
  Supabase already does. Rejected.
- **A React wrapper package:** a dependency for about 80 lines of code. Rejected (rule 7).
- **Rate limits only:** they can't tell people from bots behind many IPs. Kept as well, not instead.

## Consequences

- **Order matters when switching on.** Deploy with the site key first (the widget appears and tokens
  are sent but ignored), then enable CAPTCHA in Supabase. Enabling it in Supabase before the widget is
  live would refuse every password sign-in. Steps are in ENVIRONMENTS.
- Visitors load a third-party script on auth pages only. Cloudflare sees their IP and browser signals.
  Mention this in the privacy policy.
- E2E tests run without the widget. Cloudflare's test keys can be used for manual checks
  (ENVIRONMENTS).
- If Cloudflare is unreachable, sign-in fails while CAPTCHA is enabled. The form says so, and the
  incident response is to turn CAPTCHA off in Supabase temporarily.
