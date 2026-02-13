# Story 1.9: Audit Logs for Sensitive Account Actions (Auth + Team)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an Admin,
I want sensitive account and team actions to be audit-logged,
so that I can trace who did what and support security/compliance needs.

## Acceptance Criteria

1. **Given** a sensitive action occurs in my tenant
   **When** the system processes the action successfully (or rejects it for authorization)
   **Then** an audit event is recorded with at least: `tenantId`, `actorUserId` (or "anonymous" where applicable), action type, target identifiers (when relevant), timestamp (UTC ISO 8601), and minimal context (no secrets)

2. **Given** I perform any of these actions: login, logout, password reset completed, invite created, invite revoked, role changed, member removed
   **When** the action is processed
   **Then** an audit event is recorded for that action

3. **Given** an authentication-related action fails (e.g., wrong password)
   **When** the system rejects it
   **Then** an audit/security event is recorded without exposing sensitive details (no password/token in logs)

4. **Given** I am an Admin
   **When** I view the audit log list
   **Then** I can see audit events for my tenant only
   **And** events are ordered newest-first and are pageable

5. **Given** I am a Manager or Operator
   **When** I attempt to view audit logs
   **Then** the system rejects the request as forbidden

## Tasks / Subtasks

- [x] Add persistent audit event storage with tenant isolation (AC: 1, 4, 5)
  - [x] Add `audit_events` table to `apps/web/src/server/db/schema.ts` with: `id`, `tenantId`, `actorUserId`, `actionType`, `targetType`, `targetId`, `status`, `context`, `createdAt`
  - [x] Create SQL migration `apps/web/drizzle/0005_audit_events.sql` with RLS enabled and tenant policies aligned to `current_setting('app.tenant_id', true)::uuid`
  - [x] Add indexes for newest-first pagination and common filters (tenant + created_at, tenant + action_type)

- [x] Implement centralized audit writer service (AC: 1, 2, 3)
  - [x] Create `apps/web/src/server/services/audit-service.ts` for normalized audit writes
  - [x] Ensure writes include canonical shape (`tenantId`, `actorUserId`, `actionType`, `targetId`, `createdAt`) and forbid sensitive payload fields
  - [x] Keep structured `pino` logging, but persist auditable events in DB for queryable history

- [x] Integrate sensitive auth/team actions with audit persistence (AC: 2, 3)
  - [x] Update `apps/web/src/server/api/routers/auth.ts` to persist events for: login, logout, password reset completed, invite created/revoked, role update, member removal
  - [x] Persist explicit failure events for authentication/authorization rejects (wrong password, forbidden role change/removal) without leaking secrets
  - [x] Keep event naming consistent with existing `audit.auth.*` convention to avoid telemetry drift

- [x] Add Admin-only audit log listing API and pagination (AC: 4, 5)
  - [x] Add `listAuditEvents` query under `authRouter` with cursor/limit input schema
  - [x] Enforce Admin role check before querying audit events
  - [x] Return newest-first results with tenant scoping guaranteed by RLS + explicit tenant filter

- [x] Provide UI surface for Admin audit log review (AC: 4, 5)
  - [x] Add `apps/web/src/features/auth/components/audit-events-table.tsx` with paging controls and event summary columns
  - [x] Add Admin-gated section in `apps/web/src/app/team/page.tsx` to render audit list
  - [x] Show safe event context only (no tokens/passwords/raw secrets)

- [x] Add integration coverage and update test helpers (AC: 1, 2, 3, 4, 5)
  - [x] Create `apps/web/tests/integration/auth-audit-logs.test.ts` for event creation and listing permissions
  - [x] Extend `apps/web/tests/helpers/database.ts` cleanup order to include `audit_events`
  - [x] Add assertions for tenant isolation, newest-first ordering, and pageable output

- [x] Run verification gates (AC: all)
  - [x] `bun run --cwd apps/web test:run --maxWorkers=1`
  - [x] `bun run --cwd apps/web typecheck`

## Dev Notes

- This story should convert existing log-only audit signals into durable, tenant-scoped audit history that Admin users can query safely.
- The codebase already emits many `audit.auth.*` structured log events; use these existing event semantics as the baseline contract rather than inventing a second taxonomy.
- Tenant safety is non-negotiable: audit reads/writes must remain scoped to the active tenant context and must fail safely when context is missing.

### Developer Context

- Auth and team flows already emit audit-style structured events in `apps/web/src/server/api/routers/auth.ts`; those call sites are the integration points for durable audit writes. [Source: apps/web/src/server/api/routers/auth.ts]
- Invitation and password reset email pipelines also emit structured audit events and should remain aligned with the same naming and redaction rules. [Source: apps/web/src/server/better-auth/invitation-email.ts] [Source: apps/web/src/server/better-auth/password-reset-email.ts] [Source: apps/web/src/server/better-auth/config.ts]
- `protectedProcedure` already wraps requests in `withTenantContext`, so tenant-scoped audit persistence and listing should happen inside this boundary for authenticated actions. [Source: apps/web/src/server/api/trpc.ts] [Source: apps/web/src/server/db/rls.ts]
- Team management UI exists at `/team`; this is the most coherent place to expose an Admin-only audit list for Auth + Team actions in this epic scope. [Source: apps/web/src/app/team/page.tsx]
- Existing integration tests validate auth and team behaviors; extend the same style and helper utilities for audit assertions instead of creating a parallel test approach. [Source: apps/web/tests/integration/auth-login.test.ts] [Source: apps/web/tests/integration/auth-password-reset.test.ts] [Source: apps/web/tests/integration/auth-team-membership.test.ts]

### Technical Requirements

- Persist auditable account/team security actions to DB (not logs only) with canonical minimum fields: `tenantId`, `actorUserId` (or anonymous), `actionType`, optional target identifiers, UTC timestamp, and minimal non-secret context. [Source: _bmad-output/planning-artifacts/epics.md#Story 1.9: Audit Logs for Sensitive Account Actions (Auth + Team)]
- Cover mandatory action set: login, logout, password reset completed, invite created, invite revoked, role changed, member removed. [Source: _bmad-output/planning-artifacts/epics.md#Story 1.9: Audit Logs for Sensitive Account Actions (Auth + Team)]
- Record failed auth/authorization events (e.g., wrong password, forbidden operations) without exposing password/token data. [Source: _bmad-output/planning-artifacts/epics.md#Story 1.9: Audit Logs for Sensitive Account Actions (Auth + Team)]
- Expose Admin-only tenant audit listing that is newest-first and pageable; Manager/Operator must receive `FORBIDDEN`. [Source: _bmad-output/planning-artifacts/epics.md#Story 1.9: Audit Logs for Sensitive Account Actions (Auth + Team)]
- Keep API-visible timestamps as ISO 8601 UTC strings; do not emit numeric timestamps in API payloads. [Source: _bmad-output/planning-artifacts/architecture.md#Format Patterns] [Source: _bmad-output/project-context.md#Language-Specific Rules (TypeScript)]

### Architecture Compliance

- Keep tenant isolation defense-in-depth: tenant-scoped audit table + RLS policies + tenant context set via `withTenantContext` for protected flows. [Source: _bmad-output/planning-artifacts/architecture.md#Multi-tenancy & Isolation] [Source: apps/web/src/server/api/trpc.ts] [Source: apps/web/src/server/db/rls.ts]
- Implement migration-driven RLS policy creation in `apps/web/drizzle/*.sql`; do not rely on ad-hoc manual DB changes. [Source: _bmad-output/project-context.md#Development Workflow Rules] [Source: apps/web/drizzle/0004_products_rbac_baseline.sql]
- Keep routing boundaries intact: business logic in a server service, thin tRPC procedures in `authRouter`. [Source: _bmad-output/planning-artifacts/architecture.md#Service Boundaries]
- Use DB snake_case and API camelCase mapping consistently for audit entities. [Source: _bmad-output/planning-artifacts/architecture.md#Naming Patterns] [Source: _bmad-output/project-context.md#Language-Specific Rules (TypeScript)]
- Preserve structured JSON logging with redaction for security observability while adding durable audit persistence for compliance workflows. [Source: _bmad-output/planning-artifacts/architecture.md#Logging] [Source: apps/web/src/server/logger.ts]

### Library & Framework Requirements

- **Auth:** Keep Better Auth on maintained 1.x and enforce `>= 1.2.10`; project currently uses `^1.3` and latest npm release is `1.4.18`. Upgrade is optional for this story but must not downgrade below secure floor. [Source: _bmad-output/planning-artifacts/architecture.md#Authentication Library] [Source: apps/web/package.json] [Source: npm view better-auth version]
- **ORM/Migrations:** Continue with Drizzle ORM + drizzle-kit migration workflow; project currently `drizzle-orm ^0.44.0` while latest is `0.45.1`. If upgraded, isolate version bump and run full auth + tenancy regression checks. [Source: _bmad-output/planning-artifacts/architecture.md#ORM / Migrations / Validation] [Source: apps/web/package.json] [Source: npm view drizzle-orm version]
- **API Layer:** Keep tRPC v11 patterns for internal APIs; project dependency is `^11.0.0` and latest is `11.10.0`. Maintain current router/procedure conventions. [Source: _bmad-output/planning-artifacts/architecture.md#Primary API Style] [Source: apps/web/package.json] [Source: npm view @trpc/server version]
- **Logging:** Keep `pino` structured JSON logs with redaction and correlation fields; project currently uses `^10.3.0`. [Source: _bmad-output/planning-artifacts/architecture.md#Logging] [Source: apps/web/package.json] [Source: apps/web/src/server/logger.ts]
- **Database/RLS:** PostgreSQL current docs (18.2) reaffirm default-deny behavior when RLS is enabled without matching policy; policy correctness and tenant context are critical for safe audit listing. [Source: https://www.postgresql.org/docs/current/ddl-rowsecurity.html]

### File Structure Requirements

- **Create:** `apps/web/drizzle/0005_audit_events.sql` (or next sequential migration) for `audit_events` table, indexes, and RLS policies.
- **Modify:** `apps/web/src/server/db/schema.ts` to add Drizzle model + relations/types for `auditEvents`.
- **Create:** `apps/web/src/server/services/audit-service.ts` for event normalization and persistence helpers.
- **Modify:** `apps/web/src/server/api/routers/auth.ts` to call audit persistence helper at success/failure points and expose `listAuditEvents` query.
- **Create:** `apps/web/src/schemas/audit-events.ts` for list input/output schema and DTO typing.
- **Create:** `apps/web/src/features/auth/components/audit-events-table.tsx` for Admin audit log list UI.
- **Modify:** `apps/web/src/app/team/page.tsx` to render Admin-only audit section.
- **Modify:** `apps/web/src/server/api/root.ts` only if router extraction is introduced (keep unchanged if all endpoints remain in `authRouter`).
- **Modify:** `apps/web/tests/helpers/database.ts` cleanup order to include new `audit_events` table.

### Testing Requirements

- Add integration tests proving each required action emits an audit event with required shape and safe context: login, logout, password reset completed, invite create/revoke, role change, member removal. [Source: _bmad-output/planning-artifacts/epics.md#Story 1.9: Audit Logs for Sensitive Account Actions (Auth + Team)]
- Add tests for rejected/failed flows (wrong password and forbidden member management operations) to verify security events are persisted without secrets. [Source: _bmad-output/planning-artifacts/epics.md#Story 1.9: Audit Logs for Sensitive Account Actions (Auth + Team)]
- Add Admin-only listing tests: Admin can query own-tenant events, Manager/Operator receive `FORBIDDEN`. [Source: _bmad-output/planning-artifacts/epics.md#Story 1.9: Audit Logs for Sensitive Account Actions (Auth + Team)]
- Add pagination + sort tests to verify newest-first ordering and stable paging behavior.
- Add cross-tenant isolation tests ensuring Tenant A cannot read Tenant B audit events, including ID-guess attempts. Reuse Story 1.8 anti-leak pattern. [Source: _bmad-output/implementation-artifacts/1-8-tenant-isolation-enforcement-rls-anti-leak-tests.md]
- Re-run project gates after implementation: `bun run --cwd apps/web test:run --maxWorkers=1` and `bun run --cwd apps/web typecheck`.

### Previous Story Intelligence

- Story 1.8 hardened tenant isolation and established reusable anti-leak test patterns; use the same adversarial style for audit log read isolation. [Source: _bmad-output/implementation-artifacts/1-8-tenant-isolation-enforcement-rls-anti-leak-tests.md]
- `withTenantContext` + RLS fail-safe behavior was validated in 1.8; avoid bypassing this path when adding audit writes/reads. [Source: _bmad-output/implementation-artifacts/1-8-tenant-isolation-enforcement-rls-anti-leak-tests.md] [Source: apps/web/src/server/db/rls.ts]
- Recent 1.8 work introduced helper-driven integration testing (`tenant-test-factories`); reuse these utilities for tenant-separated audit fixtures. [Source: apps/web/tests/helpers/tenant-test-factories.ts]
- Prior review feedback in 1.8 emphasized CI and security regression checks; maintain the same rigor for this story before marking complete. [Source: _bmad-output/implementation-artifacts/1-8-tenant-isolation-enforcement-rls-anti-leak-tests.md]

### Git Intelligence Summary

- Recent commits show a strong security-first sequence: tenant isolation hardening (`03c85a7`) followed by story artifact/status synchronization (`6dc826f`). Keep this split between code changes and process artifacts. [Source: git log -5 --pretty=format:'%h %s']
- `03c85a7` touched `apps/web/src/server/db/rls.ts` and integration tests, indicating security work is expected to ship with concrete test proof. Apply the same expectation for audit logging. [Source: git show --name-status -n 1 03c85a7]
- `a69aa2c` and `244fbc0` touched UI/auth flow files without changing backend architecture; adding audit list UI should follow existing lightweight component/table patterns. [Source: git show --name-status -n 1 a69aa2c] [Source: git show --name-status -n 1 244fbc0]
- Current branch history indicates migration metadata updates are tracked explicitly (`ac45981`), so any new migration for audit events must include consistent drizzle metadata updates. [Source: git show --name-status -n 1 ac45981]

### Latest Tech Information

- Better Auth latest npm release is `1.4.18`; this project's `^1.3` range can already resolve to secure 1.x updates, but keep explicit guardrail `>=1.2.10` due prior open-redirect fix requirement in architecture. [Source: npm view better-auth version] [Source: _bmad-output/planning-artifacts/architecture.md#Authentication Library]
- Drizzle ORM latest release is `0.45.1` (project currently `^0.44.0`); no mandatory upgrade for this story, but migration syntax/features should stay compatible with installed version. [Source: npm view drizzle-orm version] [Source: apps/web/package.json]
- tRPC server latest is `11.10.0` and project remains on v11; keep typed router/procedure contract and avoid introducing REST for this audit list feature. [Source: npm view @trpc/server version] [Source: _bmad-output/planning-artifacts/architecture.md#Primary API Style]
- PostgreSQL 18.2 RLS documentation highlights default-deny semantics when enabled without policy and emphasizes `FORCE ROW LEVEL SECURITY` for owner-path hardening; apply strict policy coverage for `audit_events`. [Source: https://www.postgresql.org/docs/current/ddl-rowsecurity.html]
- OWASP Multi-Tenant Security guidance reinforces: derive tenant context from authenticated identity, never trust client-provided tenant IDs, enforce isolation at data layer, include tenant context in audit/monitoring, and alert on cross-tenant attempts. [Source: https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html]

### Project Context Reference

- Always access tenant-scoped data through established tenant context (`SET LOCAL app.tenant_id`) and never rely on ad-hoc tenant filtering alone. [Source: _bmad-output/project-context.md#Critical Don’t‑Miss Rules]
- Keep server authoritative for security decisions (RBAC/tenancy), with UI gating used only for UX. [Source: _bmad-output/project-context.md#Framework-Specific Rules (Next.js / API Boundaries)]
- Maintain strict API boundary conventions: tRPC for internal contracts, standardized DTOs, shared Zod schemas in `src/schemas/**`. [Source: _bmad-output/project-context.md#Framework-Specific Rules (Next.js / API Boundaries)] [Source: _bmad-output/project-context.md#Language-Specific Rules (TypeScript)]
- Preserve structured redacted logging and avoid secret/PII leakage in logs or telemetry. [Source: _bmad-output/project-context.md#Code Quality & Style Rules] [Source: _bmad-output/project-context.md#Critical Don’t‑Miss Rules]
- Keep migrations/versioned SQL as the only path for schema/RLS changes; avoid manual DB edits. [Source: _bmad-output/project-context.md#Development Workflow Rules]

### Project Structure Notes

- Keep auth-domain logic under `apps/web/src/server/api/routers/auth.ts` and extract reusable persistence logic into `apps/web/src/server/services/` to avoid router bloat.
- Keep new schemas under `apps/web/src/schemas/` and share them between API contracts and UI components.
- Reuse current team management surface (`apps/web/src/app/team/page.tsx`) for Admin audit visibility rather than introducing a disconnected navigation path.
- Follow existing integration test organization in `apps/web/tests/integration/` and helper patterns in `apps/web/tests/helpers/`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.9: Audit Logs for Sensitive Account Actions (Auth + Team)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Multi-tenancy & Isolation]
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security]
- [Source: _bmad-output/project-context.md#Critical Don’t‑Miss Rules]
- [Source: apps/web/src/server/api/routers/auth.ts]
- [Source: apps/web/src/server/api/trpc.ts]
- [Source: apps/web/src/server/db/rls.ts]
- [Source: apps/web/src/server/logger.ts]
- [Source: apps/web/src/app/team/page.tsx]
- [Source: apps/web/tests/integration/auth-login.test.ts]
- [Source: apps/web/tests/integration/auth-password-reset.test.ts]
- [Source: apps/web/tests/integration/auth-team-membership.test.ts]
- [Source: https://www.postgresql.org/docs/current/ddl-rowsecurity.html]
- [Source: https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html]

### Story Completion Status

- Status set to `done` after adversarial code review fixes and verification.
- Completion note: "All HIGH and MEDIUM review findings were fixed; acceptance criteria validated with passing test and typecheck gates."

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- Loaded workflow engine `_bmad/core/tasks/workflow.xml` and workflow config `_bmad/bmm/workflows/4-implementation/create-story/workflow.yaml`.
- Parsed `_bmad-output/implementation-artifacts/sprint-status.yaml` and selected first backlog story key `1-9-audit-logs-for-sensitive-account-actions-auth-team`.
- Loaded and analyzed planning artifacts: `epics.md`, `architecture.md`, `prd.md`, `ux-design-specification.md`, and `_bmad-output/project-context.md`.
- Loaded previous story context from `1-8-tenant-isolation-enforcement-rls-anti-leak-tests.md`.
- Analyzed recent git commit patterns and relevant changed files.
- Performed external technical checks for latest package/documentation signals.
- Executed adversarial code review workflow and validated implementation claims against changed files.
- Fixed discovered HIGH and MEDIUM findings, then reran verification gates.
- Verification rerun passed: `bun run --cwd apps/web typecheck` and `bun run --cwd apps/web test:run --maxWorkers=1`.

### Completion Notes List

- Story content is aligned to Epic 1 scope and focuses on durable Auth + Team audit history.
- Requirements explicitly prevent tenant leakage and secret exposure.
- Task breakdown includes DB, service, API, UI, and test layers to reduce implementation ambiguity.
- Guidance preserves existing code conventions and avoids introducing competing patterns.

### File List

- _bmad-output/implementation-artifacts/1-9-audit-logs-for-sensitive-account-actions-auth-team.md (modified)
- apps/web/src/server/db/schema.ts (modified - added auditEvents table, enums, relations, types)
- apps/web/drizzle/0005_audit_events.sql (created - migration with RLS policies)
- apps/web/drizzle/0006_fix_audit_events_rls.sql (created - fixed RLS policies for inserts)
- apps/web/drizzle/0007_add_audit_enums.sql (created - added PostgreSQL enum types)
- apps/web/drizzle/0008_audit_target_id_text.sql (created - aligns audit_events.target_id to text)
- apps/web/drizzle/meta/_journal.json (modified - added migration entries)
- apps/web/src/server/services/audit-service.ts (created - audit event persistence service)
- apps/web/src/schemas/audit-events.ts (created - audit event schemas)
- apps/web/src/server/api/routers/auth.ts (modified - added listAuditEvents query and audit persistence calls)
- apps/web/src/features/auth/components/audit-events-table.tsx (created - Admin audit log UI component)
- apps/web/src/app/team/page.tsx (modified - added audit log section for Admins)
- apps/web/tests/integration/auth-audit-logs.test.ts (created - comprehensive audit log tests)
- apps/web/tests/helpers/tenant-test-factories.ts (modified - added createTenantWithAdmin, createUserWithMembership helpers)
- apps/web/tests/helpers/trpc-test-context.ts (created - test context setup helper)
- apps/web/tests/helpers/database.ts (modified - added audit_events to cleanup order)

## Senior Developer Review (AI)

### Reviewer

- Reviewer: BMAD adversarial code review workflow
- Date: 2026-02-13

### Findings and Resolution

- HIGH: Hardcoded tenant context for auth failure audit writes could violate FK integrity and fail persistence in real flows. Fixed by deriving tenant/user context when available and safely skipping DB write when tenant context is unavailable.
- HIGH: `listAuditEvents` pagination cursor handling was unstable and could misorder/overlap pages. Fixed using stable composite cursor (`createdAt` + `id`) with deterministic newest-first ordering.
- HIGH: `audit_events.target_id` storage type mismatched real identifiers. Fixed via schema alignment and migration `0008_audit_target_id_text.sql`.
- MEDIUM: Shared list schemas were duplicated/inconsistent in API/UI boundaries. Fixed by reusing shared schemas from `apps/web/src/schemas/audit-events.ts`.
- MEDIUM: Test harness issues (session cookie handling + audit table bootstrap) caused false negatives. Fixed in helpers and DB bootstrap.

### Validation Evidence

- `bun run --cwd apps/web typecheck` passed.
- `bun run --cwd apps/web test:run --maxWorkers=1` passed (23 test files, 180 tests).
- Acceptance criteria validated as implemented with Admin-only scoped listing, failure-event logging, and pagination coverage.

## Change Log

- 2026-02-13: Story 1.9 generated via create-story workflow with exhaustive artifact, architecture, git, and latest-tech context.
- 2026-02-13: Implemented audit events table with RLS policies (schema.ts, migration 0005)
- 2026-02-13: Created centralized audit-service.ts for normalized audit writes
- 2026-02-13: Added listAuditEvents API endpoint with Admin-only access
- 2026-02-13: Updated test helpers to include audit_events in cleanup order
- 2026-02-13: All verification gates pass (typecheck, test:run)
- 2026-02-13: Integrated audit persistence in auth.ts for all sensitive actions (login, logout, password reset, invitations, role changes, member removal)
- 2026-02-13: Added forbidden attempt audit logging for unauthorized access attempts
- 2026-02-13: Created audit-events-table.tsx UI component with pagination
- 2026-02-13: Added audit log section to team page (Admin-only)
- 2026-02-13: Created auth-audit-logs.test.ts integration tests
- 2026-02-13: Updated tenant-test-factories.ts with createTenantWithAdmin and createUserWithMembership helpers
- 2026-02-13: Fixed RLS policies in migration 0006 to allow inserts while maintaining read isolation
- 2026-02-13: Added PostgreSQL enum types for audit_action_type and audit_status (migration 0007)
- 2026-02-13: Added migration 0008 to align `audit_events.target_id` with text identifiers
- 2026-02-13: Fixed audit list cursor pagination stability (composite cursor by timestamp + id)
- 2026-02-13: Removed hardcoded system tenant path for auth failure audit writes; made persistence fail-safe
- 2026-02-13: Completed adversarial code review remediation; story marked done after green typecheck + full test run
