---
paths:
  - "src/**"
  - "supabase/**"
  - ".env.example"
  - ".github/**"
---

# Authentication, authorization and security

Docs: docs/security/SECURITY.md, docs/security/AUTHORIZATION_AND_RLS.md.

- Never read, print or commit `.env*` files other than `.env.example`. Never hardcode credentials or keys.
- Secrets are read only via `src/lib/env.server.ts` (server-only). Never prefix a secret with `NEXT_PUBLIC_`.
- New env var → update `.env.example`, the Zod schema in `src/lib/env*.ts`, and docs/operations/ENVIRONMENTS.md.
- Authenticate and authorize inside every Server Action and Route Handler — they are public endpoints.
  RLS is the backstop, not a replacement; `proxy.ts` is never the sole check.
- Use `supabase.auth.getUser()`/`getClaims()` for authorization decisions on the server, not unverified
  session data from cookies.
- Fail closed. Return `NOT_FOUND` rather than revealing existence of resources the caller can't see.
- Booking/payment mutations: idempotency key required; confirmation only from authoritative state.
- Webhooks: verify signature on the raw body before parsing; idempotent processing.
- Do not log secrets, tokens, cookies, or unnecessary personal data.
- Never weaken a policy, disable RLS, or skip a security test to make something pass. Report the blocker.
