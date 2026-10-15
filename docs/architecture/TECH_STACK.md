# Tech Stack

Versions are those installed at foundation time (2026-10-12); `package.json` is authoritative.

| Concern           | Choice                                                | Why                                                                                    |
| ----------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Framework         | Next.js 16.4 App Router                               | Server Components, Server Actions, Vercel-native                                       |
| Rendering/caching | Cache Components (`cacheComponents`)                  | Static shell + streamed dynamic UI; enabled by scaffold                                |
| UI                | React 19.3, Tailwind CSS 4                            | Standard, minimal CSS tooling                                                          |
| Language          | TypeScript 5, `strict` + `noUncheckedIndexedAccess`   | Catch errors at compile time                                                           |
| Auth              | Supabase Auth via `@supabase/ssr`                     | Cookie sessions, integrates with RLS                                                   |
| Database          | Supabase Postgres 17 + RLS                            | Relational data, policies enforced in DB                                               |
| Validation        | Zod 4                                                 | Runtime validation + inferred types                                                    |
| Unit/integration  | Vitest 5                                              | Fast, ESM-native                                                                       |
| E2E               | Playwright                                            | Cross-browser E2E, CI friendly                                                         |
| DB tests          | pgTAP via `supabase test db`                          | Test RLS policies where they live                                                      |
| Lint/format       | ESLint 9 (`eslint-config-next`), Prettier 3           | Next.js rules; consistent formatting                                                   |
| Package manager   | npm (lockfile committed)                              | Default tooling, no extra setup                                                        |
| Runtime           | Node.js 22+                                           | Required by tooling; Vercel default Node runtime                                       |
| AI                | AI SDK 7; Ollama (Cloud in prod) or Vercel AI Gateway | Switchable by env ([ADR-0006](../decisions/ADR-0006-SWITCHABLE-AI-PROVIDER-OLLAMA.md)) |
| Hosting           | Vercel (`bom1`)                                       | Preview deployments per PR; Git integration                                            |
| CI                | GitHub Actions                                        | Quality gates on PRs                                                                   |

## Explicitly not used (yet)

Python/FastAPI services, message queues, Redis, ORMs (we use the Supabase client + SQL migrations), state
management libraries, component libraries. Adding any of these requires an ADR.

## Undecided

Payment provider (Razorpay proposed, [ADR-0005](../decisions/ADR-0005-PAYMENTS-RAZORPAY.md)), email/notification
provider, error tracking/monitoring vendor ([OBSERVABILITY](../engineering/OBSERVABILITY.md)), TOTP/MFA
approach for admins and partners (Supabase Auth MFA is the default candidate).
