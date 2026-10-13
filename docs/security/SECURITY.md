# Security

## Reporting vulnerabilities

Report privately to the maintainers (contact to be published before launch — open question). Do not open
public issues for vulnerabilities.

## Threat model summary (MVP)

| Asset                      | Threat                                        | Control                                                                                                                                  |
| -------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Traveler personal data     | Cross-user access                             | RLS per user; explicit column selection; pgTAP tests                                                                                     |
| Provider data and bookings | Provider reading/changing others' bookings    | RLS via `provider_members`; server-side authorization                                                                                    |
| Catalogue integrity        | Unverified/malicious listings; AI fabrication | Admin verification; AI never writes curated tables                                                                                       |
| Booking correctness        | Double booking, false confirmation            | Idempotency keys; DB-enforced transitions; authoritative confirmation only                                                               |
| Secrets                    | Leak to browser or logs                       | `server-only` modules; no `NEXT_PUBLIC_` secrets; log hygiene                                                                            |
| AI pipeline                | Prompt injection via user text or content     | Output validation + grounding; no tool access to writes; see [AI_ARCHITECTURE](../ai/AI_ARCHITECTURE.md)                                 |
| OAuth sign-in (Google)     | Login CSRF, open redirect, role spoofing      | PKCE verifier cookie bound to the browser; `next` restricted to internal paths; provider metadata only prefills the display name (pgTAP) |
| Accounts                   | Credential stuffing, enumeration              | Supabase Auth rate limits; generic auth error messages; CAPTCHA before launch (release checklist)                                        |
| Platform resources         | Abuse/spam of write paths; AI cost runaway    | Database-enforced rate limits (below); per-user + platform AI caps; AI kill switch                                                       |

## Requirements

1. **Secrets** only in Vercel/Supabase environment configuration and `.env.local` (gitignored). Secret
   access goes through `src/lib/env.server.ts`. `.claude/settings.json` denies agents reading real env files (`.env`, `.env.local*`, `.env.<environment>*`, `.envrc`), running `supabase status` (which prints local keys), and `git diff --no-index` (which can print untracked files). Only exact `git diff` forms are auto-allowed. `.env.example` stays readable.
2. **Least privilege:** user-context Supabase client by default; secret-key client only for documented
   admin/system operations, reviewed in PR.
3. **Authorization in depth:** RLS in the database **and** checks in Server Actions. `src/proxy.ts` is for
   optimistic redirects only, never the sole check.
4. **Input validation** at every boundary ([VALIDATION](../api/VALIDATION.md)).
5. **Output safety:** React escapes by default; `dangerouslySetInnerHTML` is prohibited unless content is
   sanitised and the use is reviewed. AI text is rendered as text, never HTML.
6. **Server Actions are public endpoints** — authenticate and authorize inside each one.
7. **Webhooks** verify signatures on the raw body and are idempotent.
8. **Headers** (`next.config.ts`, all routes, E2E-tested in `tests/e2e/security-headers.spec.ts`):
   Content-Security-Policy (`default-src 'self'`, no third-party origins, `frame-ancestors 'none'`,
   `object-src 'none'`, `form-action 'self'`), HSTS (2 years, subdomains), `X-Content-Type-Options`,
   `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` and COOP; `X-Powered-By` removed.
   `script-src` allows `'unsafe-inline'` because nonces would force every page to render dynamically
   (Cache Components); revisit if third-party scripts are ever added. Adding Sentry or another browser
   SDK requires extending `connect-src`. `upgrade-insecure-requests` is deliberately omitted (all sources
   are `'self'` and HSTS forces HTTPS; on plain-HTTP builds it broke protected-link prefetches).
9. **Dependencies:** lockfile committed; `npm audit` reviewed in PRs that change dependencies; no
   abandoned packages.
10. **Never weaken controls to pass a build** (disable RLS, broaden a policy, skip a test).

## Rate limits and abuse controls

Enforced in the database by `BEFORE INSERT` triggers or `security definer` functions keyed on the
acting user, so they cover every path (UI, direct API calls) and can't be spoofed. They raise SQLSTATE
`54000`, which the app shows as `RATE_LIMITED`. Values are provisional; tune them with real usage.

| Action                           | Limit                                                                           | Where                                         |
| -------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------- |
| Booking requests                 | 10 per hour, 30 per day, 20 awaiting a reply per traveller                      | `private.enforce_booking_request_limits`      |
| Provider applications            | 3 per day, 5 unverified per user                                                | `private.enforce_provider_application_limits` |
| Experiences                      | 200 per provider                                                                | `private.enforce_experience_limits`           |
| Dates (availability slots)       | 366 open future dates per experience; only verified providers; ≤ 2 years ahead  | trigger + insert policy                       |
| Itinerary generations            | 10 per hour, 30 per day per user (reserved atomically before the model call)    | `begin_itinerary_generation`                  |
| Platform AI usage                | `AI_DAILY_GENERATION_LIMIT` model-calling generations per IST day (default 300) | `begin_itinerary_generation`                  |
| Provider-confirmed booking total | INR 1 crore                                                                     | check constraint                              |

Not limited here, deliberately: **sign-in and sign-up**. An anonymous-callable limiter would let anyone
exhaust another person's quota. They rely on Supabase Auth's built-in rate limits plus CAPTCHA, which
must be enabled on hosted projects before launch ([release checklist](../operations/RELEASE_CHECKLIST.md)).

## Personal data

Collect the minimum: name, email, trip parameters, contact details for confirmed bookings. Applicable
law includes India's Digital Personal Data Protection Act, 2023 — retention, consent and deletion
requirements are an **open question** for legal review before launch.

## Known accepted risks (foundation)

`npm audit` (2026-10-12) reports 5 high-severity advisories, all in the dev-only ESLint chain
`braces` → `micromatch` → `fast-glob` → `@next/eslint-plugin-next` → `eslint-config-next`. None ship to
production bundles. The suggested `npm audit fix --force` downgrades `eslint-config-next` to 14.x, which is
incompatible with Next.js 16, so it is not applied. Re-check on every dependency update.
