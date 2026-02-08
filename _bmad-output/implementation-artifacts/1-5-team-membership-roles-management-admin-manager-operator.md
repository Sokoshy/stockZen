# Story 1.5: Team Membership + Roles Management (Admin/Manager/Operator)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an Admin,
I want to manage tenant members and their roles,
so that I can control who can access which features in my organization.

## Acceptance Criteria

1. **Given** I am authenticated as an `Admin` in a tenant
   **When** I view the tenant members list
   **Then** I can see all members of my tenant with their current roles
   **And** I cannot access members from other tenants.

2. **Given** I am authenticated as an `Admin`
   **When** I change a member role to `Admin`, `Manager`, or `Operator`
   **Then** the role change is persisted
   **And** permissions are enforced server-side based on the new role.

3. **Given** I am authenticated as an `Admin`
   **When** I remove a member from the tenant
   **Then** the member is removed from the tenant
   **And** active sessions for that member are invalidated for secure immediate access revocation.

4. **Given** I am an `Admin` and I am the last remaining `Admin` in the tenant
   **When** I attempt to remove myself from the tenant or change my role away from `Admin`
   **Then** the system rejects the request
   **And** the tenant still has at least one `Admin`.

5. **Given** I am an `Admin` and at least one other `Admin` exists in the tenant
   **When** I attempt to remove myself from the tenant
   **Then** the system requires a double confirmation step
   **And** only after confirming twice, the system removes my membership
   **And** I lose access immediately (sessions are invalidated).

6. **Given** I am authenticated as a `Manager` or `Operator`
   **When** I attempt to change roles or remove members
   **Then** the system rejects the request as forbidden.

## Tasks / Subtasks

- [x] Implement tenant member management server procedures in tRPC (AC: 1, 2, 3, 4, 5, 6)
  - [x] Add `auth.listTenantMembers` protected query scoped to `ctx.tenantId`
  - [x] Add `auth.updateTenantMemberRole` protected mutation (Admin-only)
  - [x] Add `auth.removeTenantMember` protected mutation (Admin-only)
  - [x] Add explicit forbidden responses for non-admin callers (`Manager`/`Operator`)

- [x] Add centralized role-policy guardrails for Admin actions (AC: 2, 4, 6)
  - [x] Create shared policy helpers to resolve current actor role and validate allowed transitions
  - [x] Enforce "last Admin cannot self-demote or self-remove" rule in server-side policy layer
  - [x] Ensure policy checks execute before any membership mutation

- [x] Implement secure self-removal flow with mandatory double confirmation (AC: 5)
  - [x] Add two-step confirmation contract in mutation input (e.g., explicit `confirmStep`/`confirmToken`)
  - [x] Reject self-removal until second confirmation is provided
  - [x] On confirmed self-removal, revoke current session and block immediate follow-up access

- [x] Implement session invalidation rules after role changes/removals (AC: 3, 5)
  - [x] Invalidate active sessions for removed users
  - [x] Invalidate active sessions when role downgrade/removal requires immediate permission recalculation
  - [x] Keep behavior transactional with membership updates to avoid partial state

- [x] Build Admin-facing team management UI (AC: 1, 2, 3, 5, 6)
  - [x] Add team management page for listing members and roles
  - [x] Add role update controls restricted to Admin flows
  - [x] Add remove-member action with explicit warning and self-removal double-confirm UX
  - [x] Add clear forbidden state/messaging for Manager/Operator access attempts

- [x] Add shared validation schemas and typed response contracts (AC: all)
  - [x] Define schemas for member list output, role updates, and member removal payloads
  - [x] Validate role values strictly against `Admin | Manager | Operator`
  - [x] Keep server/client contract alignment through shared Zod schemas

- [x] Add test coverage for authorization and edge cases (AC: all)
  - [x] Integration tests: Admin list/update/remove flows and tenant isolation
  - [x] Integration tests: last-admin protection and self-removal double confirmation behavior
  - [x] Integration tests: Manager/Operator forbidden for role/remove operations
  - [x] Integration tests: session invalidation after removal/self-removal
  - [x] Unit tests: policy helpers and new schema validation

## Dev Notes

- Story 1.5 extends the existing auth + tenant foundations delivered in Stories 1.2-1.4.
- This story is the RBAC control point for tenant team operations and must be server-authoritative.
- This work must preserve strict tenant isolation and establish guardrails required by Story 1.6 (invites).

### Developer Context

- Existing membership data lives in `tenant_memberships` with role enum `Admin | Manager | Operator`; no new auth provider is required for this story.
- Current authenticated context is derived from `defaultTenantId` and enforced through `protectedProcedure` + `withTenantContext`.
- `auth.getTenantMemberships` already exists and can be extended into full team-management procedures.
- Session revocation patterns are already implemented in auth flows (logout/reset-password) and should be reused for immediate access loss scenarios.
- Member-management mutations must be transaction-safe to avoid race conditions around the "last Admin" invariant.

### Technical Requirements

- Implement member-management capabilities for the active tenant: list members, update role, remove member, self-remove.
- Enforce Admin-only authorization for role updates and member removals (Manager/Operator always forbidden).
- Enforce invariants server-side before mutation:
  - Tenant must retain at least one `Admin` at all times.
  - Last Admin cannot self-demote or self-remove.
  - Self-removal requires explicit double confirmation.
- Persist role updates only to valid enum values (`Admin`, `Manager`, `Operator`) via shared schema validation.
- Revoke active sessions after membership removal/self-removal so access is lost immediately.
- Emit structured audit logs for sensitive actions: role changed, member removed, self-removal attempted/confirmed, forbidden attempts.
- Keep all mutations tenant-scoped and transaction-bound to prevent partial updates.

### Architecture Compliance

- Keep the internal contract in tRPC (`apps/web/src/server/api/routers/**`); do not introduce ad-hoc REST endpoints for team management.
- Execute all tenant-scoped reads/writes within `protectedProcedure` context so `withTenantContext` sets `app.tenant_id` for RLS.
- Keep server-side authorization authoritative; UI gating is convenience only and must never be the security boundary.
- Keep naming and payload conventions aligned: DB `snake_case`, API/JSON `camelCase`.
- Keep session handling and cookie behavior centralized in existing Better Auth/session helper patterns (no parallel auth state mechanism).
- Preserve current architectural boundary: router validates + delegates policy/business logic; avoid embedding scattered permission checks in UI code.

### Library & Framework Requirements

- Better Auth must stay on maintained 1.x with project minimum `>= 1.2.10`; latest stable observed is `v1.4.18` (1.5.x is currently beta stream).
- Do not migrate to Better Auth Organization plugin in this story unless explicitly approved; this story should extend existing `tenant_memberships` architecture already in production path.
- Reuse React Hook Form + Zod patterns for admin member-management forms and confirmations.
- Use Drizzle transaction APIs for atomic membership updates + session invalidation + last-admin invariant checks.
- Keep Next.js App Router patterns already used in auth pages/components; avoid introducing divergent state-management libraries.

### File Structure Requirements

- **Modify:**
  - `apps/web/src/server/api/routers/auth.ts` (member list/update/remove/self-remove procedures)
  - `apps/web/src/schemas/auth.ts` or `apps/web/src/schemas/team-membership.ts` (shared input/output contracts)
  - `apps/web/src/app/dashboard/page.tsx` (entry point/link to team management)
- **Create (recommended):**
  - `apps/web/src/server/auth/rbac-policy.ts` (centralized role/transition guards)
  - `apps/web/src/app/team/page.tsx` (team management screen)
  - `apps/web/src/features/auth/components/team-members-table.tsx`
  - `apps/web/src/features/auth/components/team-member-role-form.tsx`
  - `apps/web/src/features/auth/components/remove-member-dialog.tsx`
- **Create tests:**
  - `apps/web/tests/integration/auth-team-membership.test.ts`
  - `apps/web/tests/unit/auth/team-membership-policy.test.ts`
  - `apps/web/tests/unit/auth/team-membership-schema.test.ts`
- **Note on structure alignment:** architecture document suggests `src/server/auth/**` for auth policies; current project uses `src/server/better-auth/**` plus router-based auth logic. Keep consistency by adding policy utilities under `src/server/auth/**` while reusing existing Better Auth integration files.

### Testing Requirements

- Add integration tests for Admin success paths:
  - List members returns only current-tenant members.
  - Role update persists and is visible on subsequent reads.
  - Member removal revokes target user access.
- Add integration tests for authorization denials:
  - Manager/Operator cannot update roles.
  - Manager/Operator cannot remove members.
  - Cross-tenant targets are never visible/mutable.
- Add integration tests for edge-case invariants:
  - Last Admin cannot self-demote.
  - Last Admin cannot self-remove.
  - Self-removal requires double confirmation before mutation.
  - Confirmed self-removal invalidates current session and blocks follow-up protected calls.
- Add unit tests for policy helpers and schema validation of role transitions/removal confirmations.
- Run verification commands:
  - `bun run test:run --maxWorkers=1`
  - `bun run typecheck`

### Previous Story Intelligence

- Story 1.4 validated robust auth error handling patterns in `apps/web/src/server/api/routers/auth.ts`; extend this router style instead of introducing a new ad-hoc router.
- Story 1.4 and 1.3 established reliable session invalidation behavior (`session` table revocation + cookie handling); reuse these patterns for member removal and self-removal.
- Recent auth UI stories consistently pair each new page/component with targeted unit tests; keep that implementation/testing cadence for team-management UI.
- Existing integration test strategy (`createTRPCContext` + `createCaller`) is already effective for auth workflows and should be reused for role/remove invariants.
- Avoid regressions in password-reset and login/logout behavior while extending auth router responsibilities.

### Git Intelligence Summary

- Recent commit stream shows an auth-first delivery pattern: each behavior change is shipped with focused unit/integration tests in the same commit series.
- Last 5 commits concentrated in auth pages/components (`forgot-password`, `reset-password`, `login`) and paired unit tests; follow this pairing for team-management UI changes.
- Story artifact updates are isolated into dedicated commits; keep story/sprint metadata updates separate from application code when possible.
- No recent dependency churn was introduced in auth commits; prioritize extending existing stack patterns over introducing new libraries.
- Commit style is concise, action-oriented, and scoped by feature slice (e.g., "Add ...", "Handle ..."); mirror this granularity during implementation.

### Latest Tech Information

- Better Auth release stream currently shows `v1.4.18` as latest stable and `v1.5.0-beta.x` as prerelease; for this story keep 1.4.x stable track unless upgrade is explicitly planned.
- Better Auth organization capabilities now include built-in member listing, role updates, and removal hooks; useful as reference for behavior expectations, but adopting the plugin now would require broader schema/runtime migration.
- Better Auth recent release notes include cookie/session correctness fixes and organization-related hardening; avoid custom cookie/session rewrites in this story.
- OWASP Authorization guidance reinforces this story's required controls: least privilege, deny-by-default, server-side authorization on every request, centralized failure handling, and explicit authorization tests.
- Drizzle transaction guidance supports this story's critical invariants: perform last-admin checks and membership mutations in one transaction and rollback on invariant violation.

### Project Context Reference

- Keep Bun as package manager and maintain Node-compatible server conventions (no Bun-only runtime APIs in auth flows).
- Keep strict boundary rules: no client imports from `src/server/**`; no cross-feature shortcuts bypassing shared layers.
- Keep tenancy guardrails from project context: tenant-scoped operations must run with RLS context set by server helpers.
- Keep API contract standards: `camelCase` payloads, ISO-8601 UTC dates in API-visible fields.
- Keep security/observability hygiene: structured logs only, redact secrets, and avoid leaking sensitive details in authorization errors.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.5: Team Membership + Roles Management (Admin/Manager/Operator)]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 1: Accounts, Team & Secure Access (Multi-tenant)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security]
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules]
- [Source: _bmad-output/project-context.md#Critical Implementation Rules]
- [Source: _bmad-output/project-context.md#Critical Don't-Miss Rules]
- [Source: apps/web/src/server/api/routers/auth.ts]
- [Source: apps/web/src/server/api/trpc.ts]
- [Source: apps/web/src/server/db/schema.ts]
- [Source: apps/web/src/server/db/rls.ts]
- [Source: apps/web/src/server/better-auth/config.ts]
- [Source: apps/web/tests/integration/auth-login.test.ts]
- [Source: apps/web/tests/integration/auth-password-reset.test.ts]
- [Source: https://www.better-auth.com/docs/plugins/organization]
- [Source: https://www.better-auth.com/docs/authentication/email-password]
- [Source: https://github.com/better-auth/better-auth/releases]
- [Source: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html]
- [Source: https://orm.drizzle.team/docs/transactions]

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- Loaded workflow engine and create-story workflow configuration, resolved config variables, and selected target story from `sprint-status.yaml` (`1-5-team-membership-roles-management-admin-manager-operator`).
- Loaded and analyzed Epic/PRD/Architecture/UX/Project Context artifacts with focus on Story 1.5 RBAC and tenant-membership requirements.
- Loaded previous story (`1-4`) and extracted reusable auth/session/test patterns and anti-regression constraints.
- Reviewed recent git history (5 commits) to capture implementation and testing conventions.
- Performed external technical validation (Better Auth docs/releases, OWASP authorization guidance, Drizzle transaction guidance).
- Implemented `auth.listTenantMembers`, `auth.updateTenantMemberRole`, and `auth.removeTenantMember` with tenant-scoped membership checks, admin-only enforcement, and structured audit events.
- Added centralized RBAC policy helpers (`src/server/auth/rbac-policy.ts`) for role transitions, last-admin invariants, session invalidation decisioning, and signed self-removal confirmation tokens.
- Added team-management UI flow (`/team`) with role update controls, remove-member dialog, self-removal double confirmation UX, and forbidden-state messaging for non-admin users.
- Added shared Zod contracts in `src/schemas/team-membership.ts` and wired them into router inputs/outputs.
- Added integration and unit test coverage for tenant isolation, admin guardrails, double confirmation, forbidden manager/operator paths, and session invalidation.
- Verified with `bun run typecheck` and `bun run test:run --maxWorkers=1` (all passing).
- Refined membership write operations to run inside Drizzle transactions for atomic role updates/removals and invariant re-checks at commit time.
- Re-ran full quality gates after transactional refinement (`bun run typecheck`, `bun run test:run --maxWorkers=1`) with all checks passing.
- Executed adversarial code-review remediation and fixed identified HIGH/MEDIUM findings in router logic and tests.
- Added transaction-level row locking (`FOR UPDATE`) and post-mutation admin invariant assertions to harden against race conditions.
- Refined removal session revocation to avoid broad cross-tenant logout while preserving immediate revocation for self-removal/no-tenant cases.
- Added explicit cross-tenant mutation rejection coverage and updated downgrade behavior assertions in integration tests.
- Re-ran focused verification after fixes: `bun run --cwd apps/web test:run tests/integration/auth-team-membership.test.ts tests/unit/auth/team-membership-policy.test.ts tests/unit/auth/team-membership-schema.test.ts --maxWorkers=1` and `bun run --cwd apps/web typecheck` (passing).

### Completion Notes List

1. Added tenant team-management server procedures in auth router with strict tenant scoping and explicit non-admin forbidden responses.
2. Implemented centralized policy checks for role transitions and last-admin protection before all membership mutations.
3. Implemented self-removal with mandatory two-step confirmation token and immediate access revocation on confirmation.
4. Added transactional session revocation behavior for member removals and preserved immediate access recalculation for role downgrades.
5. Delivered `/team` management UI and dashboard entry point with admin controls and non-admin read-only messaging.
6. Added shared Zod contracts and typed response payloads for list/update/remove member APIs.
7. Added comprehensive tests: integration suite for auth team membership workflows and unit suites for policy + schema contracts.
8. Regression validation complete: typecheck and full test suite passed.
9. Transactional consistency tightened for membership mutations, then full regression gates revalidated.
10. Post-review hardening added row-level locking and admin invariant assertions to prevent concurrent last-admin violations.
11. Cross-tenant mutation rejection and multi-tenant session-preservation behavior are now explicitly covered by integration tests.

### File List

- apps/web/src/server/api/routers/auth.ts
- apps/web/src/schemas/team-membership.ts
- apps/web/src/server/auth/rbac-policy.ts
- apps/web/src/app/dashboard/page.tsx
- apps/web/src/app/team/page.tsx
- apps/web/src/features/auth/components/team-members-table.tsx
- apps/web/src/features/auth/components/team-member-role-form.tsx
- apps/web/src/features/auth/components/remove-member-dialog.tsx
- apps/web/tests/integration/auth-team-membership.test.ts
- apps/web/tests/unit/auth/team-membership-policy.test.ts
- apps/web/tests/unit/auth/team-membership-schema.test.ts
- _bmad-output/implementation-artifacts/1-5-team-membership-roles-management-admin-manager-operator.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

## Change Log

- 2026-02-07: Story 1.5 created with comprehensive implementation context and marked ready-for-dev.
- 2026-02-08: Implemented team membership RBAC management (API + policy + UI), added comprehensive tests, and validated full test/typecheck gates.
- 2026-02-08: Applied adversarial review fixes (concurrency hardening, session-scope correction, and cross-tenant mutation test coverage) and revalidated targeted quality gates.
