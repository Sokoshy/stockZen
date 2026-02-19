# Story 3.1: Configure Account Default Stock Thresholds (Absolute Quantities)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an Admin,
I want to configure default stock thresholds for my tenant,
so that products without product-specific thresholds still follow consistent alerting rules.

## Acceptance Criteria

1. **Given** I am authenticated as an `Admin` in a tenant
   **When** I set default `criticalThreshold` and `attentionThreshold` (absolute quantities, `> 0`)
   **Then** the defaults are saved for my tenant
   **And** the system enforces `criticalThreshold < attentionThreshold`
   **And** the healthy/green state remains derived as `stock > attentionThreshold`

2. **Given** tenant default thresholds exist
   **When** a product is created without product-specific thresholds
   **Then** the product uses tenant defaults for alerting calculations

3. **Given** I am authenticated as a `Manager` or `Operator`
   **When** I attempt to change tenant default thresholds
   **Then** the system rejects the request as forbidden

4. **Given** invalid thresholds are submitted (missing, non-numeric, `<= 0`, or `critical >= attention`)
   **When** I attempt to save
   **Then** the system rejects with clear validation errors
   **And** no changes are persisted

## Tasks / Subtasks

- [x] Add tenant-level default threshold persistence with safe migration path (AC: 1, 2, 4)
  - [x] Create a Drizzle SQL migration that adds `default_critical_threshold` and `default_attention_threshold` to `tenants`
  - [x] Add DB-level guards for positivity and ordering (`critical < attention`)
  - [x] Backfill existing tenants with deterministic defaults that preserve current behavior (`attention = 100`, `critical = 50`) and avoid null threshold state
  - [x] Update `apps/web/src/server/db/schema.ts` to include both new fields

- [x] Define shared schema contracts for threshold settings (AC: 1, 3, 4)
  - [x] Add input/output Zod schemas for tenant default thresholds in `apps/web/src/schemas`
  - [x] Enforce numeric + business validation at schema layer with field-level error messaging
  - [x] Keep API datetime and field naming conventions aligned with project rules (`camelCase` JSON)

- [x] Implement tenant-threshold API with read-for-members and admin-only updates (AC: 1, 3, 4)
  - [x] Add tRPC procedures for `getTenantDefaultThresholds` and `updateTenantDefaultThresholds`
  - [x] Reuse existing tenant membership + role checks pattern (`Admin`/`Manager`/`Operator` can read, only `Admin` can update)
  - [x] Execute writes under tenant context to preserve RLS and tenant isolation guarantees

- [x] Apply tenant defaults in product alert fallback logic (AC: 2)
  - [x] Replace hardcoded fallback in product alert/filter utility path with tenant-aware default attention threshold
  - [x] Keep compatibility with current per-product `lowStockThreshold` field until Story 3.2 introduces explicit per-product critical/attention overrides
  - [x] Ensure no regression in offline product rendering paths where alert status is computed client-side

- [x] Add admin UI to configure defaults with inline validation and non-blocking feedback (AC: 1, 3, 4)
  - [x] Add a "Default Alert Thresholds" section in an existing authenticated admin surface (dashboard-first flow)
  - [x] Show current values, allow editing, and prevent submission until values are valid
  - [x] Surface role-based forbidden state cleanly for non-admin users without exposing edit controls

- [x] Add comprehensive verification coverage and run quality gates (AC: 1, 2, 3, 4)
  - [x] Unit tests for threshold validation edge cases (`<= 0`, equality, inverted order, non-numeric)
  - [x] Integration tests for admin authorization, tenant isolation, update persistence, and forbidden access for `Manager`/`Operator`
  - [x] UI tests for validation states and successful save feedback
  - [x] Run `bun run --cwd apps/web typecheck` and `bun run --cwd apps/web test:run --maxWorkers=1`

## Dev Notes

### Developer Context

Story 3.1 is the entry point of Epic 3 (Thresholds & Alerting). Its goal is to introduce tenant-level default thresholds now, so Story 3.2 can later add optional per-product overrides and Story 3.3 can classify alerts with stable effective thresholds.

This story is not greenfield. Current implementation already has:

- Product-level `lowStockThreshold` persisted in `products` table (`apps/web/src/server/db/schema.ts`).
- Product on-alert filtering using a hardcoded fallback threshold of `100` when `lowStockThreshold` is null (`apps/web/src/features/products/utils/filter-utils.ts`).
- Existing Admin/Manager/Operator tenant membership and centralized role checks in server procedures (`apps/web/src/server/api/routers/auth.ts`, `apps/web/src/server/auth/rbac-policy.ts`).
- Existing authenticated dashboard and team management surfaces where Admin-only configuration can be introduced (`apps/web/src/app/dashboard/page.tsx`, `apps/web/src/app/team/page.tsx`).

Current gap to close in this story:

- Tenant-level default thresholds do not exist in schema or API.
- Validation rules (`> 0`, `critical < attention`) are not centralized for this domain yet.
- Product alert fallback is hardcoded and not tenant-aware.
- There is no admin UI for configuring account-level default thresholds.

### Technical Requirements

- Add tenant-level default threshold fields as absolute integer quantities and enforce domain constraints at both schema-validation and database levels.
- Keep Admin-only write access for tenant default threshold updates; `Manager` and `Operator` may read but must never update.
- RBAC matrix (explicit):
  - Read tenant defaults: `Admin`, `Manager`, `Operator`
  - Update tenant defaults: `Admin` only
- Implement explicit validation semantics for both API and UI:
  - `criticalThreshold` required numeric integer and `> 0`
  - `attentionThreshold` required numeric integer and `> 0`
  - invariant: `criticalThreshold < attentionThreshold`
- Preserve backward compatibility with existing product threshold model in Epic 2:
  - `products.lowStockThreshold` remains supported
  - if product-specific threshold is absent, derive effective threshold from tenant default attention threshold (instead of hardcoded constant)
- Keep threshold updates non-blocking in UX with inline validation errors and clear success/error feedback.
- Ensure all tenant-scoped reads/writes execute with tenant membership checks and RLS context protection.

### Architecture Compliance

- Keep server business logic in service/domain helpers under `apps/web/src/server/**`; keep routers thin (`validate input -> call service -> return DTO`).
- Preserve strict tenant isolation and RLS usage: run tenant-scoped DB operations inside protected procedures using tenant context (via existing `withTenantContext` flow in `apps/web/src/server/api/trpc.ts` and RLS helper semantics in `apps/web/src/server/db/rls.ts`).
- Respect naming boundaries: DB columns in `snake_case`; API payloads and responses in `camelCase` only.
- Keep API-visible datetimes in ISO UTC string format when returning timestamps (no numeric timestamps in JSON DTOs).
- Keep client/server boundary intact: no imports from `apps/web/src/server/**` into client components/hooks.
- Avoid introducing direct REST endpoints for this story; use tRPC router extension pattern consistent with existing product/auth modules.

### Library & Framework Requirements

- Use project baselines from `apps/web/package.json` for implementation in this story:
  - Next.js `15.5.7`
  - React `19.x`
  - tRPC `11.0.0`
  - Drizzle ORM `0.44.x`
  - Better Auth `1.3.x`
  - Zod `3.24.2`
  - Dexie `4.3.0`
  - React Hook Form `7.71.1`
  - `@hookform/resolvers` `5.2.2`
- Keep package manager as Bun and repository lockfile conventions (`bun.lock`).
- Do not perform dependency upgrades in Story 3.1; latest registry versions are informational for risk awareness only.

### File Structure Requirements

Expected implementation footprint for Story 3.1:

- `apps/web/src/server/db/schema.ts` (modify)
  - Add tenant default threshold columns to `tenants` table model.
- `apps/web/drizzle/*.sql` (new migration)
  - Add threshold columns, backfill defaults, and DB check constraints.
- `apps/web/src/schemas/` (new file, e.g. `tenant-thresholds.ts`)
  - Add Zod input/output schemas for tenant default threshold read/update contracts.
- `apps/web/src/server/api/routers/auth.ts` or `apps/web/src/server/api/routers/tenants.ts` (modify/add)
  - Add threshold procedures with member-read + admin-update semantics and tenant membership checks.
- `apps/web/src/server/api/root.ts` (modify only if a new router is introduced)
  - Register new router namespace if thresholds are isolated from existing auth router.
- `apps/web/src/features/products/utils/filter-utils.ts` (modify)
  - Replace hardcoded on-alert fallback strategy with tenant-aware default input path.
- `apps/web/src/features/products/hooks/use-product-filters.ts` and `apps/web/src/features/products/components/products-list-client.tsx` (modify as needed)
  - Thread tenant default threshold value into alert filter computation without breaking existing UX.
- `apps/web/src/app/dashboard/page.tsx` and new feature component(s) under `apps/web/src/features/` (modify/add)
  - Add admin-facing threshold settings UI with inline validation and save feedback.

### Testing Requirements

- Unit tests:
  - Add schema validation tests for threshold rules (`> 0`, required numeric, `critical < attention`).
  - Extend product alert utility tests to verify tenant-default fallback behavior replaces hardcoded constant.
- Integration tests (DB + tRPC):
  - Admin can read/update tenant defaults.
  - Manager/Operator update attempts return forbidden.
  - Tenant isolation is preserved (no cross-tenant threshold writes/reads).
  - Invalid values are rejected and persistence remains unchanged.
- UI tests:
  - Form validation states and disabled/blocked submit on invalid values.
  - Success and error feedback states on save.
  - Non-admin rendering behavior (no editable controls).
- Regression gates:
  - `bun run --cwd apps/web typecheck`
  - `bun run --cwd apps/web test:run --maxWorkers=1`

### Latest Technical Information

Latest registry snapshot (via Bun-driven package metadata check):

- `next`: `16.1.6` (project pinned to `15.5.7`)
- `@trpc/server`: `11.10.0` (project `11.0.0`)
- `drizzle-orm`: `0.45.1` (project `0.44.x`)
- `better-auth`: `1.4.18` (project `1.3.x`)
- `zod`: `4.3.6` (project `3.24.2`)
- `dexie`: `4.3.0` (project aligned)
- `react-hook-form`: `7.71.1` (project aligned)
- `@hookform/resolvers`: `5.2.2` (project aligned)

Guidance for this story:

- Stay on currently pinned versions during Story 3.1.
- If dependency upgrades are desired, isolate them in a dedicated PR and revalidate auth flows, `/api/sync`, and integration boundaries.

### Project Context Reference

Mandatory project rules to enforce in implementation:

- Bun is the package manager; do not switch tooling or lockfile conventions.
- Tenant-scoped DB access must use tenant context/RLS helper semantics; never rely on ad-hoc filters as a substitute.
- Keep server code Node-compatible (runtime policy not finalized for Bun runtime in production).
- Keep tRPC as internal app contract; avoid expanding REST surface for this story.
- Maintain API JSON shape conventions (`camelCase`) and datetime serialization rules (ISO UTC strings).
- Keep offline and sync contracts stable; this story should not alter `/api/sync` behavior.

### Story Completion Status

- Story status: `ready-for-dev`
- Context quality: includes domain validation, RBAC boundaries, data model migration plan, UX placement guidance, and regression coverage scope.
- Completion note: `Ultimate context engine analysis completed - comprehensive developer guide created`

### Project Structure Notes

- Proposed changes align with the current feature-first structure and existing server/client boundaries.
- No structural conflict detected with current repository layout (`apps/web/src/features/**`, `apps/web/src/server/**`, `apps/web/drizzle/**`).
- Router placement remains flexible (`auth` extension vs dedicated `tenants` router), but must preserve thin-router/service-driven pattern.

### References

- Story 3.1 requirements and BDD AC: [Source: _bmad-output/planning-artifacts/epics.md#Story-3.1-Configure-Account-Default-Stock-Thresholds-Absolute-Quantities]
- Epic 3 threshold and alerting sequence context: [Source: _bmad-output/planning-artifacts/epics.md#Epic-3-Thresholds--Alerting-Actionable-Alerts]
- FR14 baseline and threshold domain context: [Source: _bmad-output/planning-artifacts/prd.md#Functional-Requirements]
- Architecture constraints (RLS, tRPC boundaries, offline contracts, naming conventions): [Source: _bmad-output/planning-artifacts/architecture.md#Core-Architectural-Decisions], [Source: _bmad-output/planning-artifacts/architecture.md#Implementation-Patterns--Consistency-Rules], [Source: _bmad-output/planning-artifacts/architecture.md#Project-Structure--Boundaries]
- Project guardrails and critical rules: [Source: _bmad-output/project-context.md#Critical-Dont-Miss-Rules], [Source: _bmad-output/project-context.md#Technology-Stack--Versions], [Source: _bmad-output/project-context.md#Framework-Specific-Rules-Nextjs--API-Boundaries]
- Current implementation baselines for product thresholds and filtering: [Source: apps/web/src/server/db/schema.ts], [Source: apps/web/src/schemas/products.ts], [Source: apps/web/src/features/products/utils/filter-utils.ts]
- Existing role/membership and protected-procedure patterns: [Source: apps/web/src/server/auth/rbac-policy.ts], [Source: apps/web/src/server/api/trpc.ts], [Source: apps/web/src/server/api/routers/auth.ts]
- Existing dashboard/admin surface candidates: [Source: apps/web/src/app/dashboard/page.tsx], [Source: apps/web/src/app/team/page.tsx]

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- create-story workflow execution (interactive checkpoints; YOLO enabled for remaining sections)
- artifact analysis of epics, PRD, architecture, UX, and project-context inputs
- repository inspection of current threshold/filter/auth patterns and candidate UI surfaces
- package metadata check via Bun tooling (`bunx npm view ...`) for latest-version awareness
- dev-story workflow execution: Continuation after review, completed all test tasks

### Completion Notes List

- ✅ Fixed AC2 gap by threading tenant default attention thresholds into product on-alert filtering path (`ProductsListClient` -> `useProductFilters` -> `filter-utils`)
- ✅ Hardened tenant-thresholds API read path with explicit active-membership verification before returning tenant defaults
- ✅ Reworked `TenantThresholdsForm` to use existing project dependencies only (removed unavailable UI libs), with inline validation + feedback and strict non-admin read-only rendering
- ✅ Added integration coverage for threshold APIs (`Admin` read/update, `Manager`/`Operator` forbidden update, invalid payload rejection, cross-tenant isolation)
- ✅ Added UI coverage for loading, non-admin no-edit controls, and valid submit flow
- ✅ Stabilized local/integration test bootstrap by ensuring tenant threshold columns + constraints exist in test DB setup
- ✅ Cleaned migration drift by keeping a single Story 3.1 migration (`0012_add_tenant_thresholds`) and aligning Drizzle journal entry
- ✅ Quality gates passed:
  - `bun run --cwd apps/web typecheck`
  - `bun run --cwd apps/web test:run --maxWorkers=1` (41 files, 317 tests passing)

### File List

**New Files Created:**
- `apps/web/src/schemas/tenant-thresholds.ts` - Zod schemas for tenant threshold validation
- `apps/web/src/schemas/__tests__/tenant-thresholds.test.ts` - Unit tests for schema validation
- `apps/web/src/server/api/routers/tenant-thresholds.ts` - tRPC router with get/update procedures
- `apps/web/src/server/api/routers/__tests__/tenant-thresholds.test.ts` - Integration tests for API
- `apps/web/src/features/tenant-thresholds/components/tenant-thresholds-form.tsx` - Admin UI form component
- `apps/web/tests/unit/tenant-thresholds-form.test.tsx` - UI unit tests for loading/read-only/submit behavior
- `apps/web/drizzle/0012_add_tenant_thresholds.sql` - Tenant threshold migration (columns + constraints)

**Modified Files:**
- `apps/web/src/server/db/schema.ts` - Added default threshold fields to tenants table with CHECK constraints
- `apps/web/src/features/products/utils/filter-utils.ts` - Updated to support tenant-aware fallback
- `apps/web/src/features/products/hooks/use-product-filters.ts` - Threaded tenant default threshold into filter pipeline
- `apps/web/src/features/products/components/products-list-client.tsx` - Loaded tenant defaults and passed fallback value into filters
- `apps/web/src/server/api/root.ts` - Registered new tenantThresholds router
- `apps/web/src/app/dashboard/page.tsx` - Correct tenant membership lookup and non-admin read-only form rendering
- `apps/web/tests/helpers/ensure-test-database.ts` - Ensured tenant threshold columns/constraints exist for test DB bootstrap
- `apps/web/tests/unit/products/filter-utils.test.ts` - Added tenant-default fallback assertions
- `apps/web/drizzle/meta/_journal.json` - Aligned journal with single Story 3.1 migration

**Files Modified (No Logic Changes):**
- `_bmad-output/implementation-artifacts/3-1-configure-account-default-stock-thresholds-absolute-quantities.md` - Updated status and completion notes
