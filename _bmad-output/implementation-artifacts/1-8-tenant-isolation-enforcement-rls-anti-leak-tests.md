# Story 1.8: Tenant Isolation Enforcement (RLS + Anti-Leak Tests)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a tenant user,
I want my tenant's data to be strictly isolated from other tenants,
so that I can trust that no cross-account access is possible.

## Acceptance Criteria

1. **Given** I am authenticated and belong to a tenant
   **When** the server handles my request
   **Then** the DB transaction establishes tenant context (e.g., `SET LOCAL app.tenant_id = '<tenant-uuid>'`)
   **And** all tenant-scoped reads/writes are constrained to that tenant

2. **Given** I am authenticated in Tenant A
   **When** I attempt to read or mutate a tenant-scoped resource belonging to Tenant B
   **Then** the server denies access
   **And** no data from Tenant B is returned or modified

3. **Given** tenant context is missing or invalid for a request
   **When** a tenant-scoped query is executed
   **Then** the operation fails safely (no cross-tenant leakage)

4. **Given** automated tests exist for tenant isolation
   **When** tests create Tenant A and Tenant B with distinct data
   **Then** tests verify Tenant A cannot access Tenant B data for both reads and writes

## Tasks / Subtasks

- [x] Implement RLS context enforcement middleware/procedure (AC: 1, 3)
  - [x] Verify `withTenantContext` middleware correctly sets `SET LOCAL app.tenant_id`
  - [x] Ensure tenant context is set at the start of every protected procedure
  - [x] Add validation that tenant context is established before any DB operations
  - [x] Handle missing/invalid tenant context with safe failure (no cross-tenant access)

- [x] Create comprehensive anti-leak test suite (AC: 2, 4)
  - [x] Write integration tests that verify cross-tenant read attempts are blocked
  - [x] Write integration tests that verify cross-tenant write attempts are blocked
  - [x] Test with multiple entity types (products, users, team memberships, etc.)
  - [x] Test edge cases: direct ID guessing, malformed tenant headers, context switching

- [x] Verify RLS policy coverage across all tenant-scoped tables (AC: 1, 2, 3)
  - [x] Audit all tenant-scoped tables have RLS enabled
  - [x] Verify RLS policies use `tenant_id = current_setting('app.tenant_id')::uuid` pattern
  - [x] Ensure no tables bypass RLS (superuser/developer bypass disabled in production)

- [x] Document tenant isolation verification procedures (AC: 4)
  - [x] Create test patterns that can be reused for future stories
  - [x] Document how to verify tenant isolation is working correctly
  - [x] Add tenant isolation checks to CI/CD pipeline

- [x] Run verification gates (AC: all)
  - [x] `bun run --cwd apps/web test:run --maxWorkers=1`
  - [x] `bun run --cwd apps/web typecheck`

## Dev Notes

- Story 1.8 is a foundational security hardening story: it verifies and enforces the multi-tenant isolation architecture before scaling to more complex features.
- This story MUST prove that RLS is actually working, not just configured. Anti-leak tests are the primary deliverable.
- The goal is to prevent the most critical SaaS security failure: data leakage between tenants.
- Testing approach: create parallel tenant environments and actively attempt to breach isolation.

### Developer Context

- Current tenant context middleware (`withTenantContext`) is already established in `apps/web/src/server/api/trpc.ts` and should be the enforcement point for all protected procedures. [Source: apps/web/src/server/api/trpc.ts]
- RLS helper functions exist in `apps/web/src/server/db/rls.ts` for setting tenant context at the DB level via `SET LOCAL app.tenant_id`. [Source: apps/web/src/server/db/rls.ts]
- Previous stories (1.2-1.7) have established tenant-scoped tables with RLS policies; this story verifies they actually prevent cross-tenant access. [Source: apps/web/src/server/db/schema.ts]
- The test infrastructure already supports deterministic DB cleanup and multi-tenant test scenarios (see auth integration tests). [Source: apps/web/tests/helpers/database.ts]
- Story 1.7 demonstrated product RBAC with tenant isolation; similar patterns should be extended for comprehensive isolation testing. [Source: _bmad-output/implementation-artifacts/1-7-rbac-enforcement-hide-purchaseprice-for-operators.md]

### Technical Requirements

- Ensure tenant context is ALWAYS set before any tenant-scoped DB operation. [Source: _bmad-output/planning-artifacts/epics.md#Story 1.8: Tenant Isolation Enforcement (RLS + Anti-Leak Tests)]
- RLS policies must be the PRIMARY defense against cross-tenant access, with application-layer checks as secondary defense. [Source: _bmad-output/planning-artifacts/architecture.md#Multi-tenancy & Isolation]
- When tenant context is missing or invalid, operations must FAIL SAFE (deny access) rather than fail open. [Source: _bmad-output/planning-artifacts/epics.md#Story 1.8: Tenant Isolation Enforcement (RLS + Anti-Leak Tests)]
- Anti-leak tests must cover: direct ID access attempts, context switching attacks, malformed tenant IDs, and bulk operation leakage. [Source: _bmad-output/planning-artifacts/epics.md#Story 1.8: Tenant Isolation Enforcement (RLS + Anti-Leak Tests)]

### Architecture Compliance

- All protected API procedures must use `protectedProcedure` chain that includes `withTenantContext` middleware. [Source: apps/web/src/server/api/trpc.ts] [Source: _bmad-output/project-context.md#Critical Don't-Miss Rules]
- DB RLS policies are defined in SQL migrations under `apps/web/drizzle/` and must use the `current_setting('app.tenant_id')` pattern. [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture]
- Tenant-scoped tables include: `products`, `stock_movements`, `users`, `team_memberships`, `audit_events`, `alerts`. [Source: apps/web/src/server/db/schema.ts]
- Keep test patterns reusable for future tenant-scoped entities. [Source: _bmad-output/implementation-artifacts/1-7-rbac-enforcement-hide-purchaseprice-for-operators.md]

### Library & Framework Requirements

- Use Drizzle ORM for all DB operations to ensure RLS context is respected. [Source: apps/web/package.json]
- Use existing Vitest test runner with custom test DB helpers for isolation testing. [Source: apps/web/tests/helpers/database.ts]
- Leverage existing tRPC test caller pattern with direct context injection for automated testing. [Source: apps/web/tests/integration/auth-team-membership.test.ts]

### File Structure Requirements

- **Modify:** `apps/web/src/server/api/trpc.ts` - verify `withTenantContext` middleware is correctly positioned in the protectedProcedure chain.
- **Modify:** `apps/web/src/server/db/rls.ts` - ensure tenant context setting is robust and validates tenant ID format.
- **Create:** `apps/web/tests/integration/tenant-isolation.test.ts` - comprehensive anti-leak test suite covering all tenant-scoped tables.
- **Create:** `apps/web/tests/helpers/tenant-test-factories.ts` - reusable test utilities for multi-tenant test scenarios (create tenant A/B, switch contexts, verify isolation).
- **Review:** `apps/web/drizzle/*_rls*.sql` - verify all RLS policies are correctly defined and active.

### Testing Requirements

- Add integration tests that verify: Tenant A user cannot read Tenant B products, users, or memberships.
- Add integration tests that verify: Tenant A user cannot write (create/update/delete) to Tenant B data.
- Add integration tests for RLS bypass attempts: missing tenant context, invalid tenant ID, superuser simulation.
- Add tests for bulk operations: ensure tenant isolation holds for list queries with hundreds of records.
- Test edge cases: UUID guessing attacks, race conditions in context switching, transaction isolation.
- All tests must clean up deterministically using existing database helper patterns.
- Re-run project gates: `bun run --cwd apps/web test:run --maxWorkers=1` and `bun run --cwd apps/web typecheck`.

### Previous Story Intelligence

- Story 1.7 established patterns for product RBAC with tenant isolation, demonstrating how to test role-based and tenant-scoped access controls. [Source: _bmad-output/implementation-artifacts/1-7-rbac-enforcement-hide-purchaseprice-for-operators.md]
- Story 1.7's integration tests show how to set up parallel test tenants and verify cross-tenant isolation is enforced. [Source: apps/web/tests/integration/products-rbac.test.ts]
- Previous auth stories (1.2-1.6) established tenant context patterns via `withTenantContext` middleware that should be the foundation for all protected procedures. [Source: _bmad-output/implementation-artifacts/1-2-sign-up-create-tenant-admin-start-session.md]
- The deterministic test DB cleanup pattern from earlier stories should be reused for tenant isolation tests to ensure test reliability. [Source: apps/web/tests/helpers/database.ts]
- Story 1.6's invitation flow demonstrated secure cross-tenant isolation during the join process; similar defensive programming should be applied here. [Source: _bmad-output/implementation-artifacts/1-6-invite-user-to-tenant-revocable-expiring-link-set-password.md]

### Git Intelligence Summary

- Recent commits show consistent feature-boundary enforcement: auth, products, and team features remain properly isolated. [Source: git log --oneline]
- Latest commit (0e287b0) updated story 1.7 artifacts and sprint status, showing the team maintains sprint artifacts alongside feature code. [Source: git log -1]
- Commit pattern shows security-sensitive features (auth, RBAC, invitations) receive dedicated test coverage commits after implementation, suggesting tenant isolation tests are mandatory before story completion. [Source: git log --oneline -10]
- Sprint artifacts are maintained separately from feature code (status updates in dedicated commits), suggesting story 1.8's sprint-status.yaml update should be a standalone commit after implementation. [Source: git log --grep="sprint"]

### Latest Tech Information

- PostgreSQL RLS remains the recommended approach for multi-tenant SaaS isolation in 2025-2026, with strong community consensus on `tenant_id` + RLS policies. [Source: https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/]
- Drizzle ORM continues to support raw SQL for RLS context setting, which is the pattern used in this codebase. [Source: https://orm.drizzle.team/docs/sql]
- OWASP recommends defense-in-depth for multi-tenant applications: RLS at DB layer + application-layer checks + comprehensive testing. [Source: https://cheatsheetseries.owasp.org/cheatsheets/Multitenancy_Security_Cheat_Sheet.html]
- PostgreSQL 15+ performance optimizations for RLS make it viable for high-throughput SaaS applications without significant overhead. [Source: https://www.postgresql.org/docs/current/ddl-rowsecurity.html]

### Project Context Reference

- Maintain strict tenant safety: never query tenant-scoped data outside tenant context. [Source: _bmad-output/project-context.md#Critical Don't-Miss Rules]
- All tenant-scoped tables must have `tenant_id` column and RLS policies enforced. [Source: _bmad-output/project-context.md#Critical Don't-Miss Rules]
- Keep tests deterministic with proper DB cleanup between test runs to prevent cross-test contamination. [Source: _bmad-output/project-context.md#Code Quality & Style Rules]
- RLS context setting must happen at the start of every transaction/procedure, before any queries. [Source: _bmad-output/planning-artifacts/architecture.md#Tenant Association & RLS Interaction]

### Project Structure Notes

- Tenant context middleware is centralized in `apps/web/src/server/api/trpc.ts` and should be verified as the first middleware in protectedProcedure chain. [Source: apps/web/src/server/api/trpc.ts]
- RLS helper functions are in `apps/web/src/server/db/rls.ts` and should be the ONLY way tenant context is set. [Source: apps/web/src/server/db/rls.ts]
- Existing tenant-scoped tables are defined in `apps/web/src/server/db/schema.ts` with proper `tenant_id` columns and relations. [Source: apps/web/src/server/db/schema.ts]
- Integration tests live in `apps/web/tests/integration/` and should include a dedicated tenant-isolation.test.ts file. [Source: apps/web/tests/integration/]
- RLS policies are defined in SQL migrations under `apps/web/drizzle/` and should be audited for completeness. [Source: apps/web/drizzle/]

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.8: Tenant Isolation Enforcement (RLS + Anti-Leak Tests)]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 1: Accounts, Team & Secure Access (Multi-tenant)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Multi-tenancy & Isolation]
- [Source: _bmad-output/planning-artifacts/architecture.md#Tenant Association & RLS Interaction]
- [Source: _bmad-output/project-context.md#Critical Don't-Miss Rules]
- [Source: _bmad-output/implementation-artifacts/1-7-rbac-enforcement-hide-purchaseprice-for-operators.md]
- [Source: apps/web/src/server/api/trpc.ts]
- [Source: apps/web/src/server/db/rls.ts]
- [Source: apps/web/src/server/db/schema.ts]
- [Source: apps/web/tests/helpers/database.ts]
- [Source: apps/web/tests/integration/products-rbac.test.ts]
- [Source: https://www.postgresql.org/docs/current/ddl-rowsecurity.html]
- [Source: https://cheatsheetseries.owasp.org/cheatsheets/Multitenancy_Security_Cheat_Sheet.html]

### Story Completion Status

- Status confirmed as `done`.
- Completion note: "Adversarial code review completed and all HIGH/MEDIUM findings were fixed with validation evidence."

## Dev Agent Record

### Agent Model Used

openai/kimi-k2.5-free

### Debug Log References

- Loaded and executed workflow engine `_bmad/core/tasks/workflow.xml` with workflow config `_bmad/bmm/workflows/4-implementation/create-story/workflow.yaml`.
- Parsed sprint-status.yaml to identify next story: 1-8-tenant-isolation-enforcement-rls-anti-leak-tests.
- Loaded epics.md to extract Story 1.8 requirements and acceptance criteria.
- Loaded architecture.md to understand RLS and multi-tenancy patterns.
- Loaded previous story 1.7 for context continuity and testing patterns.
- Analyzed git history to understand recent implementation patterns.
- Created comprehensive story file with all required sections.

### Implementation Plan

1. **Verify RLS Context Middleware** (`trpc.ts`):
   - Confirm `withTenantContext` is first middleware in `protectedProcedure` chain
   - Ensure tenant ID is extracted from session and set via `SET LOCAL app.tenant_id`
   - Add validation that context is established before DB operations

2. **Anti-Leak Test Suite** (`tenant-isolation.test.ts`):
   - Test cross-tenant read attempts are blocked for all entity types
   - Test cross-tenant write attempts are blocked
   - Test edge cases: ID guessing, malformed context, missing context
   - Test bulk operations maintain isolation
   - Test transaction-level isolation

3. **Test Helper Utilities** (`tenant-test-factories.ts`):
   - `createTestTenant()`: Create isolated tenant with admin user
   - `createTenantContext()`: Build tRPC caller with specific tenant context
   - `attemptCrossTenantAccess()`: Helper to verify access is denied
   - `verifyTenantIsolation()`: Comprehensive isolation verification

4. **RLS Policy Audit**:
   - Review all existing RLS policies in drizzle migrations
   - Verify `tenant_id = current_setting('app.tenant_id')::uuid` pattern
   - Confirm no tables bypass RLS

5. **Documentation**:
   - Document tenant isolation test patterns for reuse
   - Add tenant isolation verification to developer onboarding

### Completion Notes List

- Comprehensive tenant isolation story created with focus on RLS enforcement
- Anti-leak testing strategy defined with specific attack vectors to test
- Previous story patterns (1.7) leveraged for testing approach
- All tenant-scoped tables identified for testing coverage
- RLS context middleware verification requirements defined

### Implementation Completed (2026-02-12)

1. **Verified RLS Context Middleware** (`trpc.ts`):
   - Confirmed `withTenantContext` is first middleware in `protectedProcedure` chain
   - Tenant ID is extracted from session and set via `SET LOCAL app.tenant_id` in transaction
   - Validation ensures context is established before DB operations

2. **Created Comprehensive Anti-Leak Test Suite** (`tenant-isolation.test.ts`):
   - 17 integration tests covering tenant isolation scenarios
   - Tests for cross-tenant read isolation (products + memberships)
   - Tests for cross-tenant write isolation (products + membership mutation attempts)
   - Tests for bulk operations with hundreds of rows, transaction isolation, and malformed header hardening
   - Tests for missing/misaligned tenant context fail-safe behavior
   - All tests pass successfully

3. **Created Test Helper Utilities** (`tenant-test-factories.ts`):
   - `createTestTenant()`: Create isolated tenant with admin user
   - `createTenantContext()`: Build tRPC caller with specific tenant context
   - `addUserToTenantWithRole()`: Add user with specific role to tenant
   - `attemptCrossTenantRead/Write()`: Helper to verify access is denied
   - `verifyTenantIsolation()`: Comprehensive isolation verification

4. **RLS Policy Audit**:
   - Reviewed existing RLS policies in drizzle migrations (0001, 0003, 0004)
   - Verified `tenant_id = current_setting('app.tenant_id')::uuid` pattern
   - All tenant-scoped tables have proper RLS: tenants, tenant_memberships, tenant_invitations, products

5. **Verification**:
   - Tenant isolation suite passes (17/17)
   - Tenant management suite passes (10/10)
   - TypeScript typecheck passes

### Code Review Fixes Applied (2026-02-12)

- Fixed CRITICAL/HIGH gap by extending anti-leak coverage beyond products to tenant memberships.
- Fixed CRITICAL/HIGH gap by adding CI checks for typecheck + tenant isolation suite.
- Fixed HIGH gap by validating tenant UUID format in `setTenantContext` and enforcing fail-safe RLS activation.
- Fixed HIGH gap by adding explicit tests for missing tenant context and mismatched tenant membership context.
- Fixed MEDIUM gap by adding bulk isolation coverage with hundreds of seeded rows.
- Fixed MEDIUM gap by strengthening malformed header scenario to assert no cross-tenant leak.
- Fixed MEDIUM documentation gap by aligning story file list with actual changed files and reviewed files.

### File List

- _bmad-output/implementation-artifacts/1-8-tenant-isolation-enforcement-rls-anti-leak-tests.md (updated - review findings, fixes, final status)
- apps/web/src/server/db/rls.ts (modified - tenant UUID validation and fail-safe row_security activation)
- apps/web/tests/helpers/tenant-test-factories.ts (modified - multi-entity anti-leak helper support)
- apps/web/tests/integration/tenant-isolation.test.ts (modified - expanded suite to 17 tests, including context and bulk hardening)
- apps/web/tests/integration/tenant-management.test.ts (modified - invalid tenant ID format coverage)
- .github/workflows/ci.yml (created - CI gate for tenant isolation + typecheck)
- _bmad-output/implementation-artifacts/sprint-status.yaml (updated - story status sync)
- apps/web/src/server/api/trpc.ts (reviewed - no change required)
- apps/web/drizzle/0001_tenants_users_memberships.sql (reviewed - no change required)
- apps/web/drizzle/0003_add_tenant_invitations.sql (reviewed - no change required)
- apps/web/drizzle/0004_products_rbac_baseline.sql (reviewed - no change required)

## Change Log

- 2026-02-12: Story implementation completed with tenant isolation test foundation.
- 2026-02-12: Adversarial code review fixes applied (HIGH/MEDIUM resolved), CI checks added, and status moved to done.
