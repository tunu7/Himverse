# Security

## Reporting vulnerabilities

Report privately to the maintainers (contact to be published before launch — open question). Do not open
public issues for vulnerabilities.

## Threat model summary (MVP)

| Asset                      | Threat                                        | Control                                                                                                  |
| -------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Traveler personal data     | Cross-user access                             | RLS per user; explicit column selection; pgTAP tests                                                     |
| Provider data and bookings | Provider reading/changing others' bookings    | RLS via `provider_members`; server-side authorization                                                    |
| Catalogue integrity        | Unverified/malicious listings; AI fabrication | Admin verification; AI never writes curated tables                                                       |
| Booking correctness        | Double booking, false confirmation            | Idempotency keys; DB-enforced transitions; authoritative confirmation only                               |
| Secrets                    | Leak to browser or logs                       | `server-only` modules; no `NEXT_PUBLIC_` secrets; log hygiene                                            |
| AI pipeline                | Prompt injection via user text or content     | Output validation + grounding; no tool access to writes; see [AI_ARCHITECTURE](../ai/AI_ARCHITECTURE.md) |
| Accounts                   | Credential stuffing, enumeration              | Supabase Auth rate limits; generic auth error messages                                                   |

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
8. **Headers:** add a Content Security Policy and security headers before launch (Phase 5) — see
   `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`.
9. **Dependencies:** lockfile committed; `npm audit` reviewed in PRs that change dependencies; no
   abandoned packages.
10. **Never weaken controls to pass a build** (disable RLS, broaden a policy, skip a test).

## Personal data

Collect the minimum: name, email, trip parameters, contact details for confirmed bookings. Applicable
law includes India's Digital Personal Data Protection Act, 2023 — retention, consent and deletion
requirements are an **open question** for legal review before launch.

## Known accepted risks (foundation)

`npm audit` (2026-10-12) reports 5 high-severity advisories, all in the dev-only ESLint chain
`braces` → `micromatch` → `fast-glob` → `@next/eslint-plugin-next` → `eslint-config-next`. None ship to
production bundles. The suggested `npm audit fix --force` downgrades `eslint-config-next` to 14.x, which is
incompatible with Next.js 16, so it is not applied. Re-check on every dependency update.
