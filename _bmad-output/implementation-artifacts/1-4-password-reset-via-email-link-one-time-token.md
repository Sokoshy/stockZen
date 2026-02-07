# Story 1.4: Password Reset via Email Link (One-Time Token)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to reset my password via an email link,
so that I can regain access if I forget my password.

## Acceptance Criteria

1. **Given** I am not authenticated
   **When** I request a password reset for my email
   **Then** the system responds with a generic success message (no user enumeration)
   **And** if the email exists, the system generates a one-time reset token with a short expiration
   **And** sends an email containing a reset link

2. **Given** I open a reset link with a valid, unexpired token
   **When** I set a new valid password
   **Then** the system updates my password securely
   **And** the reset token is invalidated (cannot be reused)
   **And** existing sessions for my user are invalidated

3. **Given** the token is invalid, expired, or already used
   **When** I attempt to use the reset link
   **Then** the system rejects the request with a non-sensitive error
   **And** prompts me to request a new reset link

4. **Given** I submit an invalid or weak new password
   **When** I attempt to reset my password
   **Then** the system rejects with field-level validation errors
   **And** the password is not changed

## Tasks / Subtasks

- [x] Configure Better Auth password-reset hooks and policies (AC: 1, 2, 3)
  - [x] Add `emailAndPassword.sendResetPassword` callback in `apps/web/src/server/better-auth/config.ts`
  - [x] Set `emailAndPassword.resetPasswordTokenExpiresIn` to a short TTL (recommendation: 900 seconds)
  - [x] Enable `emailAndPassword.revokeSessionsOnPasswordReset` to enforce AC2
  - [x] Add `emailAndPassword.onPasswordReset` callback to emit audit log entry

- [x] Implement request/reset password tRPC flow (AC: 1, 2, 3, 4)
  - [x] Add `auth.requestPasswordReset` mutation in `apps/web/src/server/api/routers/auth.ts`
  - [x] Add `auth.resetPassword` mutation in `apps/web/src/server/api/routers/auth.ts`
  - [x] Ensure request flow always returns generic success message regardless of account existence
  - [x] Map invalid or expired token failures to non-sensitive user-facing error text
  - [x] Add dedicated rate limits for reset request and reset submit flows

- [x] Extend shared validation schemas (AC: 1, 4)
  - [x] Add `requestPasswordResetSchema` (email)
  - [x] Add `resetPasswordSchema` (`token`, `newPassword`, `confirmPassword`) with password policy reuse
  - [x] Add response schemas for reset request and reset submit operations

- [x] Build UI for forgot/reset password journey (AC: 1, 2, 3, 4)
  - [x] Create `apps/web/src/app/(auth)/forgot-password/page.tsx` with request form
  - [x] Create `apps/web/src/features/auth/components/forgot-password-form.tsx`
  - [x] Create `apps/web/src/app/(auth)/reset-password/page.tsx` with token/error handling
  - [x] Create `apps/web/src/features/auth/components/reset-password-form.tsx`
  - [x] Add `Forgot password?` link to `apps/web/src/app/(auth)/login/page.tsx`

- [x] Implement reset email delivery integration (AC: 1)
  - [x] Add a password-reset email sender utility used by `sendResetPassword`
  - [x] Ensure reset URL is generated from trusted base URL config only
  - [x] Keep email sending async/non-blocking in auth handler path

- [x] Add coverage for security-critical behaviors (AC: 1, 2, 3, 4)
  - [x] Unit tests for new schemas in `apps/web/tests/unit/auth/validation.test.ts`
  - [x] Integration tests for request flow generic response (existing vs non-existing email)
  - [x] Integration tests for successful reset, invalid token, expired token, and token replay rejection
  - [x] Integration tests ensuring all existing sessions are revoked after successful reset
  - [x] Integration tests for reset flow rate limiting

## Dev Notes

### Developer Context

- Story 1.4 builds directly on Story 1.2 (signup + tenant bootstrap) and Story 1.3 (login/logout + session handling).
- Current auth stack already uses Better Auth with DB-backed sessions and tRPC wrapper mutations.
- Existing auth router, cookie propagation, and rate-limit helpers should be extended, not replaced.
- UX goal is low-friction recovery with clear feedback and zero account enumeration leakage.

### Technical Requirements

- Use Better Auth built-in password reset endpoints via server API:
  - `auth.api.requestPasswordReset({ body: { email, redirectTo } })`
  - `auth.api.resetPassword({ body: { token, newPassword } })`
- Keep reset request response generic for both existing and non-existing emails.
- Enforce one-time token semantics and short expiration window.
- Invalidate all existing sessions after successful password reset.
- Do not auto-login user after reset completion; redirect user to normal login flow.
- Apply strict rate limiting to reset request and token submit endpoints.

### Architecture Compliance

- Keep internal API contract in tRPC (`apps/web/src/server/api/routers/auth.ts`); do not introduce parallel ad-hoc REST endpoints.
- Continue using Better Auth Next.js handler at `apps/web/src/app/api/auth/[...all]/route.ts`.
- Keep server logic authoritative for security; UI must not implement security-only checks.
- Preserve structured logging with redaction using existing `apps/web/src/server/logger.ts`.
- Avoid direct custom SQL token management; rely on Better Auth verification flow and tables.

### Library & Framework Requirements

- Better Auth:
  - Project constraint remains maintained 1.x with `>= 1.2.10` minimum.
  - Latest stable observed: `1.4.18`.
  - Prefer `/request-password-reset` + `/reset-password`; avoid deprecated `forget-password/email-otp` path.
- Next.js remains on 15.x in this story; do not couple story scope with Next 16 upgrade.
- Reuse React Hook Form + Zod patterns already used in `login-form.tsx` and `sign-up-form.tsx`.

### File Structure Requirements

- **Modify:**
  - `apps/web/src/server/better-auth/config.ts`
  - `apps/web/src/server/api/routers/auth.ts`
  - `apps/web/src/schemas/auth.ts`
  - `apps/web/src/app/(auth)/login/page.tsx`
  - `apps/web/src/lib/env.ts`
  - `apps/web/.env.example`
- **Create:**
  - `apps/web/src/app/(auth)/forgot-password/page.tsx`
  - `apps/web/src/app/(auth)/reset-password/page.tsx`
  - `apps/web/src/features/auth/components/forgot-password-form.tsx`
  - `apps/web/src/features/auth/components/reset-password-form.tsx`
  - `apps/web/src/server/better-auth/password-reset-email.ts`
  - `apps/web/tests/integration/auth-password-reset.test.ts`

### Testing Requirements

- Add/extend tests in:
  - `apps/web/tests/unit/auth/validation.test.ts`
  - `apps/web/tests/integration/auth-password-reset.test.ts`
- Validate scenarios:
  - Generic response for unknown email in reset request
  - Valid token password reset success
  - Invalid/expired/used token rejection
  - Session invalidation after reset
  - Rate-limit behavior for reset abuse attempts
- Run verification commands:
  - `bun run test:run --maxWorkers=1`
  - `bun run typecheck`

### Previous Story Intelligence

- Story 1.3 already solved fragile Set-Cookie propagation in tRPC route handling; reuse that exact pattern.
- Auth router currently centralizes login/logout and audit-style log events; keep reset flows in same router for consistency.
- Existing helpers to reuse:
  - `apps/web/src/server/better-auth/session-cookie.ts`
  - `apps/web/src/server/rate-limit.ts`
- Integration test style to reuse:
  - `createTRPCContext` + `createCaller`
  - `// @vitest-environment node` at file header
- Tenant/RLS enforcement pattern from prior stories must remain untouched for protected procedures.

### Git Intelligence Summary

- Recent relevant commits indicate preferred implementation style:
  - `481b61d` added auth UI by creating dedicated components/pages and wiring tRPC mutations.
  - `4931325` added a focused integration suite (`auth-login.test.ts`) with end-to-end auth assertions.
  - `d451076` refined test environment boundaries (`@vitest-environment node`) and config cleanup.
- Actionable guidance:
  - Extend existing auth component/test patterns rather than introducing a second auth style.
  - Keep changes concentrated in auth router, shared schemas, and auth pages/components.

### Latest Tech Information

- Better Auth password-reset flow supports:
  - `sendResetPassword` callback for email side-channel
  - `resetPasswordTokenExpiresIn` (default 3600s)
  - `onPasswordReset` callback
  - Optional `revokeSessionsOnPasswordReset`
- Better Auth implementation includes built-in generic reset-request message and timing-attack mitigation simulation for unknown users.
- OWASP forgot-password guidance to enforce in implementation:
  - Uniform response wording and timing
  - Single-use, expiring, cryptographically strong tokens
  - Side-channel delivery over HTTPS
  - Session invalidation after reset
  - No automatic login after reset

### Project Context Reference

- Critical constraints from `_bmad-output/project-context.md`:
  - Keep Bun as package manager and avoid stack migrations in this story.
  - Keep DB naming in `snake_case`, API payloads in `camelCase`.
  - Keep server/client boundaries: no client import from `src/server/**`.
  - Keep structured logging with redaction (never log tokens/passwords/secrets).
  - Keep rate limiting on auth-sensitive endpoints.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4: Password Reset via Email Link (One-Time Token)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security]
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns]
- [Source: _bmad-output/project-context.md#Critical Don't-Miss Rules]
- [Source: _bmad-output/implementation-artifacts/1-3-login-logout-short-session-remember-me.md]
- [Source: apps/web/src/server/api/routers/auth.ts]
- [Source: apps/web/src/server/better-auth/config.ts]
- [Source: https://www.better-auth.com/docs/authentication/email-password]
- [Source: https://github.com/better-auth/better-auth/releases/tag/v1.4.18]
- [Source: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html]

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- Parsed sprint tracking and selected first backlog story key (`1-4-password-reset-via-email-link-one-time-token`).
- Analyzed epic, PRD, architecture, UX, and project-context artifacts.
- Extracted carry-forward implementation constraints from Story 1.3.
- Reviewed recent Git history for implementation and testing patterns.
- Researched Better Auth password reset behavior and OWASP reset security guidance.
- Implemented Better Auth reset policy hooks in `apps/web/src/server/better-auth/config.ts` (900s token TTL, session revocation, reset callbacks).
- Added unit coverage for reset policy configuration in `apps/web/tests/unit/auth/password-reset-config.test.ts`.
- Implemented password reset tRPC mutations and security controls in `apps/web/src/server/api/routers/auth.ts`.
- Added/reset flow integration suite in `apps/web/tests/integration/auth-password-reset.test.ts` covering generic response, success, token invalid/expired/replay, session invalidation, and rate limits.
- Added password reset error parsing helpers in `apps/web/src/server/better-auth/password-reset-errors.ts` with dedicated unit tests in `apps/web/tests/unit/auth/password-reset-errors.test.ts`.
- Ran targeted suites and full regression: `bun run test:run tests/unit/auth/password-reset-errors.test.ts tests/integration/auth-password-reset.test.ts`, `bun run test:run --maxWorkers=1`, and `bun run typecheck`.
- Added shared password reset schemas and response contracts in `apps/web/src/schemas/auth.ts`, then switched router input/output validation to these shared schemas.
- Extended validation unit coverage in `apps/web/tests/unit/auth/validation.test.ts` for password-reset request/reset payloads and response schema contracts.
- Re-ran targeted and full validation after schema refactor: `bun run test:run tests/unit/auth/validation.test.ts`, `bun run test:run tests/integration/auth-password-reset.test.ts`, `bun run test:run --maxWorkers=1`, and `bun run typecheck`.
- Implemented forgot/reset password UI pages and forms in `apps/web/src/app/(auth)/forgot-password/page.tsx`, `apps/web/src/app/(auth)/reset-password/page.tsx`, `apps/web/src/features/auth/components/forgot-password-form.tsx`, and `apps/web/src/features/auth/components/reset-password-form.tsx`.
- Added `Forgot password?` entry point in `apps/web/src/app/(auth)/login/page.tsx`.
- Added UI unit coverage for pages/forms in `apps/web/tests/unit/auth/login-page.test.tsx`, `apps/web/tests/unit/auth/forgot-password-page.test.tsx`, `apps/web/tests/unit/auth/reset-password-page.test.tsx`, `apps/web/tests/unit/auth/forgot-password-form.test.tsx`, and `apps/web/tests/unit/auth/reset-password-form.test.tsx`.
- Re-ran targeted and full validation for UI delivery: `bun run test:run tests/unit/auth/login-page.test.tsx tests/unit/auth/forgot-password-page.test.tsx tests/unit/auth/reset-password-page.test.tsx tests/unit/auth/forgot-password-form.test.tsx tests/unit/auth/reset-password-form.test.tsx`, `bun run test:run --maxWorkers=1`, and `bun run typecheck`.
- Implemented reset email sender utility in `apps/web/src/server/better-auth/password-reset-email.ts` with trusted reset URL generation and async/non-blocking queue handoff.
- Wired Better Auth `sendResetPassword` to the new utility in `apps/web/src/server/better-auth/config.ts` and switched tRPC reset redirect generation to `getTrustedPasswordResetRedirectUrl()` in `apps/web/src/server/api/routers/auth.ts`.
- Extended env schema and examples for optional webhook transport in `apps/web/src/lib/env.ts` and `apps/web/.env.example`.
- Added utility test coverage in `apps/web/tests/unit/auth/password-reset-email.test.ts` (trusted URL construction, webhook payload, non-2xx failure handling, and non-blocking queue behavior).
- Re-ran focused and full validation: `bun run test:run tests/unit/auth/password-reset-email.test.ts tests/unit/auth/password-reset-config.test.ts tests/unit/auth/forgot-password-form.test.tsx tests/unit/auth/reset-password-form.test.tsx tests/integration/auth-password-reset.test.ts`, `bun run test:run --maxWorkers=1`, and `bun run typecheck`.
- Extended security-focused schema tests in `apps/web/tests/unit/auth/validation.test.ts` for empty reset-request email and missing reset token paths.
- Confirmed end-to-end coverage in `apps/web/tests/integration/auth-password-reset.test.ts` for anti-enumeration response, invalid/expired/replayed token handling, session invalidation, and dedicated rate limits.
- Re-ran focused and full validation for security coverage: `bun run test:run tests/unit/auth/validation.test.ts tests/integration/auth-password-reset.test.ts`, `bun run test:run --maxWorkers=1`, and `bun run typecheck`.
- Executed final completion gate regression: `bun run test:run --maxWorkers=1` (77 tests passed).
- Executed final completion gate typecheck: `bun run typecheck` (no TypeScript errors).
- Verified all tasks/subtasks are checked, confirmed File List completeness, and moved story status to `review`.
- Ran adversarial code review and validated AC/task claims against implementation and tests.
- Hardened reset-token error classification in `apps/web/src/server/better-auth/password-reset-errors.ts` to recognize invalid, expired, used, and verification-not-found variants.
- Updated `apps/web/src/features/auth/components/reset-password-form.tsx` to redirect users to `/login` after successful reset.
- Added timeout + bounded retry behavior for password-reset webhook delivery in `apps/web/src/server/better-auth/password-reset-email.ts`.
- Expanded unit coverage for new token-error variants and email timeout/retry behavior in `apps/web/tests/unit/auth/password-reset-errors.test.ts` and `apps/web/tests/unit/auth/password-reset-email.test.ts`; updated reset-form unit assertions in `apps/web/tests/unit/auth/reset-password-form.test.tsx`.
- Re-ran focused and full validation after review fixes: `bun run test:run tests/unit/auth/password-reset-errors.test.ts tests/unit/auth/password-reset-email.test.ts tests/unit/auth/reset-password-form.test.tsx`, `bun run test:run tests/integration/auth-password-reset.test.ts`, `bun run test:run --maxWorkers=1`, and `bun run typecheck`.
- Reconciled git-vs-story discrepancy scope: no application source mismatches in story File List; unrelated `_bmad/**` and IDE command-folder changes treated as out-of-scope for story implementation review.
- Addressed LOW review follow-up by replacing internal auth-page anchor links with Next.js `Link` in `apps/web/src/app/(auth)/login/page.tsx`, `apps/web/src/app/(auth)/forgot-password/page.tsx`, and `apps/web/src/app/(auth)/reset-password/page.tsx`.
- Re-ran auth-page unit tests and typecheck after navigation-link updates: `bun run test:run tests/unit/auth/login-page.test.tsx tests/unit/auth/forgot-password-page.test.tsx tests/unit/auth/reset-password-page.test.tsx`, `bun run typecheck`.

### Completion Notes List

1. Ultimate context engine analysis completed - comprehensive developer guide created.
2. Story prepared with implementation guardrails focused on security, non-enumeration, and session invalidation.
3. Story status set to `ready-for-dev`.
4. Completed Better Auth reset policy configuration with audit hooks and baseline unit coverage.
5. Validation gate passed for Task 1: full suite green (`bun run test:run --maxWorkers=1`) and typecheck clean (`bun run typecheck`).
6. Completed tRPC password reset request/submit flow with generic messaging, non-sensitive token error mapping, and dedicated rate limits.
7. Added password-reset focused integration coverage and shared unit coverage for error-message mapping helpers.
8. Validation gate passed for Task 2: targeted suites green, full regression suite green, and typecheck clean.
9. Completed shared validation schema extension for password reset request/reset inputs and response contracts.
10. Validation gate passed for Task 3: schema unit suite green, password-reset integration suite green, full regression suite green, and typecheck clean.
11. Completed forgot/reset password UI journey with dedicated pages/forms and login entry point wiring.
12. Validation gate passed for Task 4: UI-focused unit suites green, full regression suite green, and typecheck clean.
13. Completed reset email delivery integration with trusted URL generation and async/non-blocking transport handoff.
14. Validation gate passed for Task 5: email utility unit suite green, password-reset integration suite green, full regression suite green, and typecheck clean.
15. Completed security-critical coverage task by closing remaining schema edge-case assertions and validating existing reset security integration scenarios.
16. Validation gate passed for Task 6: focused security suites green, full regression suite green (77 tests), and typecheck clean.
17. Final story-level definition-of-done validation passed; story marked `review` with sprint tracking aligned.
18. Adversarial review identified HIGH/MEDIUM findings around token-error robustness, reset-flow redirect behavior, and email transport resilience.
19. Implemented robust reset-token error classification to satisfy AC3 across additional provider error variants.
20. Enforced post-reset navigation to standard login flow (`/login`) after successful password update.
21. Added password-reset email delivery timeout and bounded retry behavior for transient transport failures.
22. Revalidated with targeted suites, integration suite, full regression (78 tests), and typecheck; story advanced to `done`.
23. Resolved remaining LOW review issue by switching auth-page internal navigation from anchors to Next.js `Link` components.
24. Revalidated auth page tests and type safety after LOW issue fix; story remains `done`.

### File List

- _bmad-output/implementation-artifacts/1-4-password-reset-via-email-link-one-time-token.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- apps/web/src/server/better-auth/config.ts
- apps/web/src/server/api/routers/auth.ts
- apps/web/src/server/better-auth/password-reset-errors.ts
- apps/web/src/server/better-auth/password-reset-email.ts
- apps/web/src/schemas/auth.ts
- apps/web/src/app/(auth)/forgot-password/page.tsx
- apps/web/src/app/(auth)/reset-password/page.tsx
- apps/web/src/app/(auth)/login/page.tsx
- apps/web/src/features/auth/components/forgot-password-form.tsx
- apps/web/src/features/auth/components/reset-password-form.tsx
- apps/web/src/lib/env.ts
- apps/web/.env.example
- apps/web/tests/integration/auth-password-reset.test.ts
- apps/web/tests/unit/auth/login-page.test.tsx
- apps/web/tests/unit/auth/forgot-password-page.test.tsx
- apps/web/tests/unit/auth/reset-password-page.test.tsx
- apps/web/tests/unit/auth/forgot-password-form.test.tsx
- apps/web/tests/unit/auth/reset-password-form.test.tsx
- apps/web/tests/unit/auth/password-reset-email.test.ts
- apps/web/tests/unit/auth/password-reset-config.test.ts
- apps/web/tests/unit/auth/password-reset-errors.test.ts
- apps/web/tests/unit/auth/validation.test.ts

## Change Log

- 2026-02-07: Story 1.4 created with exhaustive implementation context and marked ready-for-dev.
- 2026-02-07: Implemented Better Auth password-reset policy hooks and added config unit test coverage.
- 2026-02-07: Implemented tRPC password reset request/submit flow with security controls and expanded integration/unit test coverage.
- 2026-02-07: Added shared password-reset validation/response schemas and aligned router/tests with the shared contracts.
- 2026-02-07: Implemented forgot/reset password UI pages and forms, linked login entry point, and added UI unit test coverage.
- 2026-02-07: Implemented reset email delivery integration with trusted reset URL generation, async transport handoff, env updates, and utility test coverage.
- 2026-02-07: Finalized security-critical test coverage for password reset flows and revalidated full regression + typecheck.
- 2026-02-07: Completed final regression/DoD validation and advanced Story 1.4 status to review.
- 2026-02-07: Applied adversarial review fixes (robust token error mapping, redirect-to-login after reset, email transport timeout/retry), expanded unit coverage, revalidated full suite, and moved story to done.
- 2026-02-07: Addressed final LOW review follow-up by replacing auth-page anchors with Next.js `Link` and revalidating auth-page unit tests + typecheck.
