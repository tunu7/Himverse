---
paths:
  - "src/app/**"
  - "src/components/**"
  - "src/features/**"
  - "src/proxy.ts"
---

# Next.js 16 and React rules

This is Next.js 16 with Cache Components (`cacheComponents: true`). APIs differ from older versions —
check `node_modules/next/dist/docs/` before using one. Architecture: docs/architecture/ARCHITECTURE.md.

- Server Components by default. `"use client"` only at the smallest interactive leaf.
- Client code must never import `src/server/**`, `@/lib/env.server`, or `@/lib/supabase/server`.
- Request-time APIs (`cookies()`, `headers()`, session, `searchParams`) must render inside `<Suspense>`;
  use `'use cache'` / `'use cache: private'` per the bundled docs, never cache user data in shared caches.
- Middleware is `src/proxy.ts` in Next.js 16. Use it only for session refresh and optimistic redirects —
  never as the only authorization check.
- `src/app` stays thin: compose feature components; no queries or business rules inline.
- Server Actions live in `src/features/<feature>/actions.ts`: validate (Zod) → authenticate → authorize →
  call `src/server` → return `ActionResult` (`@/lib/errors`).
- Every data view handles loading, empty, success and error states; segments get `error.tsx` where useful.
- Accessibility: semantic elements, labelled inputs, keyboard reachable, visible focus, alt text.
- Render AI-generated text as plain text. No `dangerouslySetInnerHTML` without sanitisation and review.
- Never show a booking as confirmed or an item as available unless the server says so from authoritative data.
