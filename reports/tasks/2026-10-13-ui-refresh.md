# Task Report: Modern minimalist UI refresh

- Date: 2026-10-13
- Author: Claude Code (agent)
- Branch / commit: main / uncommitted

## Objective and scope

The client said the design looked awful and asked for a modern, minimalist, responsive UI that feels fresh,
with animations where they improve the experience. In scope: the design system and shared shells (traveller
site, auth, partner and admin portals), home, the listing cards and the experience/destination detail pages.
Out of scope: behaviour, data, copy that tests assert on, and per-page layouts of the forms in the portals
(they pick up the new tokens and radii but were not redesigned individually).

## Summary of implementation

- **Tokens** (`globals.css`): warm stone neutrals, a pine-green accent, new `on-accent` and `ink` tokens,
  and Instrument Serif (via `next/font`, self-hosted so the CSP's `font-src 'self'` still holds) for a
  few italic headline accents.
- **Motion**: CSS-only. `animate-rise`/`fade`/`pop`/`drift` keyframes for staggered entrances, menus and
  slowly drifting ridge art. Sections and cards also fade up on scroll using scroll-driven animations
  (`animation-timeline: view()`), guarded by `@supports` and `prefers-reduced-motion: no-preference`.
  Skeletons shimmer. Reduced motion turns off every animation, delay and smooth scroll. No JS animation
  library was added.
- **Shell**: a glass sticky header with pill nav and a new phone menu (native `<details>`, works without
  JS), a shared `BrandMark`/`BrandLogo`, a multi-column footer, refreshed account menu, auth split
  layout and portal bars.
- **Components**: dark-pill primary buttons and softer inputs and alerts. Cards have ridge-art bands
  that zoom on hover, and destination skies are picked deterministically from the slug. The experience
  and destination pages have visual heroes and a facts grid.
- **Home**: centred editorial hero with search, a promise strip, numbered steps, and a dark CTA band.

## Files

| Change   | Path                                                                                            | Notes                                               |
| -------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Created  | src/components/brand.tsx                                                                        | Shared logo mark                                    |
| Modified | src/app/globals.css, src/app/layout.tsx                                                         | Tokens, motion, display font                        |
| Modified | src/components/{site-header,site-footer,nav-links,account-menu,ui,page-shell,form-feedback}.tsx | Shell + primitives                                  |
| Modified | src/app/(site)/page.tsx, src/app/(auth)/*, detail pages                                         | Redesigned pages                                    |
| Modified | src/features/discovery/components/_, portal/components/_, google-sign-in                        | Cards, filters, portal bars                         |
| Modified | Several pages/forms                                                                             | `rounded-2xl`, dropped `shadow-xs`; on-accent token |

## Architectural and database changes

None. No new dependencies (the font comes from `next/font/google`, already part of Next.js).

## Security and migration implications

None. CSP unchanged and verified by the security-headers E2E test. Nothing is fetched from a third party
at runtime.

## Tests and commands executed

| Command                | Result (actual)                                                    |
| ---------------------- | ------------------------------------------------------------------ |
| `npm run verify`       | Pass: format, lint, typecheck, 266/266 unit tests, build           |
| `npm run test:e2e`     | 53 passed                                                          |
| Playwright screenshots | Desktop/375px, light/dark; no horizontal overflow on checked pages |

## Build, lint and type-check status

- Format: pass
- Lint: pass
- Typecheck: pass
- Unit tests: pass (266)
- Build: pass
- E2E: pass (53)
- DB tests: not run (no database changes)

## Known issues, limitations, unverified assumptions

- Scroll-reveal runs only in browsers that support scroll-driven animations (Chromium; Safari/Firefox just
  show content statically).
- Portal pages (provider/admin forms, bookings lists) inherit the new tokens but weren't individually
  redesigned or screenshotted.
- The experience filter form is still long on phones (all fields stacked).

## Environment variables or manual steps required

None.

## Follow-up tasks

- Collapse the advanced experience filters behind a "Filters" toggle on mobile.
- Replace the decorative bands with provider photos once uploads exist.
- Give the portal dashboards and booking lists a dedicated design pass.
