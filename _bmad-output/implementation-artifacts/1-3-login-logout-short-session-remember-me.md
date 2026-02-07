# Story 1.3: Login + Logout (Short Session + Remember Me)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a returning user,
I want to sign in and sign out with an optional remember-me session,
so that I can access my tenant securely and control how long I stay signed in.

## Acceptance Criteria

1. Given I am not authenticated
   When I submit valid credentials
   Then the system creates a DB-backed session and sets an auth cookie (httpOnly; secure in production)
   And I can access authenticated endpoints within my tenant context.

2. Given I do not select remember me
   When the session is created
   Then the session is short-lived per the configured inactivity timeout
   And it does not persist across browser restarts.

3. Given I select remember me
   When the session is created
   Then the session expiration is extended and persists across browser restarts.

4. Given I submit invalid credentials
   When the login attempt is processed
   Then I receive a generic error message (no user enumeration)
   And no session or auth cookie is created.

5. Given I am authenticated
   When I log out
   Then the server invalidates the session in the database
   And the auth cookie is cleared/expired
   And subsequent authenticated requests fail.

6. Given I call any tenant-scoped endpoint while authenticated
   When the request is processed
   Then tenant context is established for the request
   And access remains confined to my tenant.

## Tasks / Subtasks

- [x] Implement login/logout server flow (AC: 1, 4, 5, 6)
  - [x] Verify credentials via Better Auth and create DB session
  - [x] Propagate Set-Cookie headers from tRPC route handler
  - [x] Invalidate session and clear cookie on logout
  - [x] Enforce tenant context for authenticated requests
  - [x] Apply auth rate limiting and generic error responses
  - [x] Record audit events for login success/failure and logout

- [x] Implement remember-me session policy (AC: 2, 3)
  - [x] Extend session expiration when rememberMe is true
  - [x] Ensure default sessions follow 30-minute inactivity timeout and use a session cookie

- [x] Build login UI with remember-me (AC: 1, 2, 3, 4)
  - [x] Add checkbox and client validation using shared Zod schema
  - [x] Show generic error state on failed login

- [x] Add logout action in authenticated UI (AC: 5)
  - [x] Trigger logout mutation and redirect to login

- [x] Add tests for login/logout and sessions (AC: all)
  - [x] Unit tests for login validation schema
  - [x] Integration tests for session creation, cookie, remember-me, logout

## Dev Notes

- Reuse Better Auth DB session config and session-cookie helper from Story 1.2; keep cookie propagation through the tRPC route handler.
- Implement login/logout in the auth tRPC router and UI; ensure Set-Cookie headers reach the client via `apps/web/src/app/api/trpc/[trpc]/route.ts`.
- Establish tenant context per authenticated request using `withTenantContext` + `defaultTenantId`; never query tenant tables without RLS context.
- Apply strict auth rate limiting and generic error messaging; log only via pino with redaction; audit login/logout and failed attempts.
- UX must be low-friction: optional remember-me only, no extra steps; maintain a11y constraints for auth UI.

### Developer Context

- Purpose: allow existing users to sign in/out securely with short sessions by default and optional persistent sessions via remember-me.
- Remember-me must control session expiry and cookie persistence; default sessions should not survive browser restarts.
- Logout must revoke the DB session and clear the cookie so follow-up requests fail.

### Architecture Compliance

- Auth uses Better Auth 1.x with DB-backed sessions (no JWT as primary auth); cookies are httpOnly and secure in production.
- Session expiry follows the 30-minute inactivity requirement; remember-me extends expiration only (no extra auth steps) and uses a persistent cookie.
- All tenant-scoped access requires `SET LOCAL app.tenant_id` via the RLS helper; do not rely on ad-hoc `WHERE tenant_id = ...`.
- tRPC is the only internal API surface for auth; REST is reserved for `/api/sync` only.
- Use structured pino logging with redaction; record audit events for login/logout and failed attempts.
- Apply stricter rate limits for auth endpoints using the shared rate-limit helper.

### Security Notes

- Never store auth tokens or secrets in localStorage/sessionStorage; rely on httpOnly cookies managed server-side.

### Project Structure Notes

- Auth server code stays in `apps/web/src/server/auth/**` and `apps/web/src/server/api/routers/auth.ts`.
- UI auth components in `apps/web/src/features/auth/components/**`; route pages in `apps/web/src/app/(auth)/**`.
- Shared schemas in `apps/web/src/schemas/**` (Zod) used by server + client.
- No client imports from `apps/web/src/server/**`; keep API calls via tRPC client only.

### Library & Framework Requirements

- Better Auth must remain in maintained 1.x line with version constraint `>= 1.2.10`.
- Latest registry shows `better-auth` 1.4.18 (reference only; do not upgrade implicitly).
- Use Zod schemas for login/rememberMe validation shared between client and server.
- Continue with Bun as package manager; no package manager changes.

### File Structure Requirements

- Server auth flow lives in `apps/web/src/server/api/routers/auth.ts`; reuse existing sign-up patterns and helpers.
- Session/cookie helpers in `apps/web/src/server/better-auth/session-cookie.ts`; do not duplicate cookie logic.
- Session configuration in `apps/web/src/server/better-auth/config.ts` for default vs remember-me expiry.
- Login page at `apps/web/src/app/(auth)/login/page.tsx` and login form component in `apps/web/src/features/auth/components/` (mirror sign-up form patterns).
- Shared login schema should live in `apps/web/src/schemas/auth.ts` (or extend existing schema file there).
- Logout UI action should be placed in an authenticated surface (dashboard/header) without importing server code into client.

### Testing Requirements

- Unit: extend `apps/web/tests/unit/auth/validation.test.ts` with login + rememberMe validation cases.
- Integration: add login/logout coverage mirroring `apps/web/tests/integration/auth-signup.test.ts` (session cookie propagation, tenant context, logout invalidation).
- RLS: ensure authenticated requests still use `withTenantContext` (avoid tenant leaks).
- Rate limiting: verify auth rate limit behavior for repeated login attempts.

### References

- Epic requirements: `_bmad-output/planning-artifacts/epics.md`.
- Architecture guardrails: `_bmad-output/planning-artifacts/architecture.md`.
- UX/auth constraints: `_bmad-output/planning-artifacts/ux-design-specification.md`.
- Project rules: `_bmad-output/project-context.md`.
- Previous story learnings: `_bmad-output/implementation-artifacts/1-2-sign-up-create-tenant-admin-start-session.md`.

### Previous Story Intelligence

- Story 1.2 established session-cookie helpers and required Set-Cookie propagation from the tRPC route handler.
- Tenant context is derived from `defaultTenantId` and enforced via `withTenantContext` in `apps/web/src/server/db/rls.ts`.
- Auth endpoints already use rate limiting helper in `apps/web/src/server/rate-limit.ts`.
- UI patterns: React Hook Form + Zod with field-level error mapping (see sign-up form).
- Existing test patterns in `apps/web/tests/integration/auth-signup.test.ts` and `apps/web/tests/integration/tenant-management.test.ts`.

### Git Intelligence Summary

- Recent commits focus on auth session cookie propagation and tenant context setup; reuse those patterns.
- Auth router and tRPC handler were modified recently; stay consistent with header propagation logic.
- Tests and rate limit helper were added; extend them rather than creating new helpers.

### Latest Tech Information

- Better Auth latest registry version is 1.4.18 (reference only). Keep project constraint `>= 1.2.10` unless explicitly upgraded.

## Dev Agent Record

### Agent Model Used

- openai/gpt-5.3-codex

### Implementation Plan

1. Add shared login schema with `rememberMe` flag and wire server/client validation through Zod.
2. Extend auth tRPC router with `login` and `logout` mutations using Better Auth APIs.
3. Enforce auth hardening in login flow: strict rate limit, generic invalid-credentials errors, and audit logging.
4. Implement remember-me policy by setting short default session TTL (30 minutes) and persistent extended sessions (30 days) when requested.
5. Propagate/override session cookies via tRPC response headers and clear cookie explicitly on logout.
6. Add login page + login form UI with remember-me checkbox and generic error rendering.
7. Replace dashboard server-action logout with tRPC logout mutation from authenticated UI.
8. Add/extend unit and integration tests for login/logout, remember-me behavior, tenant-scoped access, and auth rate limiting.

### Debug Log References

- Added `login`/`logout` auth procedures in `apps/web/src/server/api/routers/auth.ts` with Better Auth session handling.
- Updated session cookie utilities for non-persistent default cookies and explicit clear-cookie support.
- Switched Better Auth default session policy to short-lived sessions.
- Added auth UI components/pages for login and logout mutation-driven flow.
- Added integration test suite scaffold for login/logout and remember-me behavior.

### Completion Notes List

1. Ultimate context engine analysis completed - comprehensive developer guide created.
2. Implemented auth `login` and `logout` mutations with Better Auth, strict login rate limiting, generic invalid-credentials messaging, and audit log events for success/failure/logout.
3. Implemented remember-me policy: default short session behavior plus 30-day persistent session when `rememberMe` is true.
4. Added login UI with shared Zod validation (`rememberMe` checkbox) and generic server error rendering.
5. Replaced dashboard server-action logout with tRPC logout mutation and redirect to `/login`.
6. Added and executed auth validation/unit and integration tests; full suite passes when run serially (`bun test:run --maxWorkers=1`).
7. Fixed TypeScript quality-gate issues so `bun run typecheck` now passes.
8. Review follow-up fixes: login now requests Better Auth response headers (`returnHeaders: true`) and propagates all Set-Cookie headers reliably.
9. Fixed Better Auth cookie customization wiring (`session_token` + `attributes`) so configured `__session` naming is applied consistently.
10. Passed `rememberMe` through to Better Auth sign-in and kept remember-me behavior by extending DB session expiry for authenticated user sessions.
11. Hardened integration coverage to verify tenant-scoped protected access after login and DB invalidation on logout.
12. Removed unsafe Vitest config cast by switching integration tests to per-file `@vitest-environment node`.

### File List

- apps/web/src/schemas/auth.ts
- apps/web/src/server/api/routers/auth.ts
- apps/web/src/server/api/trpc.ts
- apps/web/src/server/better-auth/config.ts
- apps/web/src/server/better-auth/session-cookie.ts
- apps/web/src/server/logger.ts
- apps/web/src/features/auth/components/login-form.tsx
- apps/web/src/features/auth/components/logout-button.tsx
- apps/web/src/app/(auth)/login/page.tsx
- apps/web/src/app/dashboard/page.tsx
- apps/web/tests/unit/auth/validation.test.ts
- apps/web/tests/integration/auth-login.test.ts
- apps/web/tests/integration/auth-signup.test.ts
- apps/web/tests/integration/tenant-management.test.ts
- apps/web/vitest.config.ts
- docker-compose.yml
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/1-3-login-logout-short-session-remember-me.md

## Change Log

- 2026-02-07: Implemented Story 1.3 login/logout flow with remember-me sessions, login/logout UI updates, and auth test coverage.
- 2026-02-07: Code review remediation applied (cookie propagation/config fixes, remember-me hardening, stronger integration assertions, Vitest typing cleanup).
