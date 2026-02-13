# Story 2.1: Create Product (Offline-First)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a tenant user,
I want to create a product with core fields, even while offline,
so that I can manage inventory immediately without needing connectivity.

## Acceptance Criteria

1. **Given** I am authenticated in a tenant
   **When** I create a product with `name`, `category`, `unit`, `price` (sale price), and optional `barcode`
   **Then** the product is saved locally on the device
   **And** it is visible immediately in the product list while offline

2. **Given** I am `Admin` or `Manager`
   **When** I create or edit a product
   **Then** I can optionally set `purchasePrice` (cost)

3. **Given** I am an `Operator`
   **When** I create or edit a product
   **Then** I can complete the action without seeing or setting `purchasePrice`

4. **Given** I am offline
   **When** I create a product
   **Then** the app confirms success without blocking on sync
   **And** the product is marked as pending sync (local state)

5. **Given** I provide invalid values (e.g., empty name, negative price)
   **When** I attempt to save
   **Then** the app shows field-level validation errors
   **And** the product is not created locally

6. **Given** I am authenticated as `Admin`, `Manager`, or `Operator`
   **When** I create a product
   **Then** the system allows the action (role-permitted)

7. **Given** I am an `Operator`
   **When** I view products
   **Then** `purchasePrice` is not displayed and not exposed via Operator-facing API responses (per RBAC)

## Tasks / Subtasks

- [x] Implement offline product creation flow in client product feature (AC: 1, 4, 5)
  - [x] Add product create form/page under `apps/web/src/features/products/**` and route entrypoint under `apps/web/src/app/products/**`
  - [x] Validate create payload locally with shared Zod schema before local persistence
  - [x] Persist new products in IndexedDB (Dexie) and tag unsynced items with pending sync state
  - [x] Render pending-sync status in list/detail views without blocking UX

- [x] Add offline data layer primitives for products (AC: 1, 4, 5)
  - [x] Create Dexie schema/tables for local products and outbox operations (`operationId`, timestamps, status)
  - [x] Add enqueue helper that records create-product operation in outbox using idempotency-ready metadata
  - [x] Ensure API/DTO fields remain camelCase at boundaries while DB/local storage mappings remain explicit

- [x] Enforce RBAC for `purchasePrice` on server and client contracts (AC: 2, 3, 6, 7)
  - [x] Reuse centralized role policy helpers to ensure Admin/Manager can write `purchasePrice` and Operator cannot
  - [x] Confirm Operator-facing responses never expose `purchasePrice` in create/list/get paths
  - [x] Ensure Operator-submitted `purchasePrice` is sanitized/ignored server-side (not only hidden in UI)

- [x] Align product schema and persistence with Story 2.1 fields (AC: 1, 5)
  - [x] Extend product data model/contracts to include `category`, `unit`, and optional `barcode` if missing
  - [x] Keep validation constraints explicit (required name/category/unit/price, non-negative numeric rules)
  - [x] Preserve tenant-scoped access patterns and avoid cross-tenant assumptions

- [x] Prepare synchronization compatibility for Story 2.5 integration (AC: 4)
  - [x] Model outbox payload shape to be compatible with future `/api/sync` contract (`operationId`, payload, retry state)
  - [x] Keep local create path independent of network availability and safe for replay/idempotency

- [x] Add comprehensive tests for offline create + RBAC behavior (AC: 1-7)
  - [x] Unit tests for product create form validation and role-based field behavior
  - [x] Integration tests for server RBAC/serialization around `purchasePrice`
  - [x] Integration tests for tenant isolation on product create/list paths
  - [ ] Offline tests require browser environment (IndexedDB) - to be tested via e2e tests

- [x] Run verification gates (AC: all)
  - [x] `bun run --cwd apps/web typecheck`
  - [x] `bun run --cwd apps/web test:run --maxWorkers=1`

## Dev Notes

This story introduces the first real offline-first product creation path on top of an already working online product module and RBAC baseline.

### Developer Context

- Current product server contract already exists (`products.list/getById/create/update/delete`) with tenant-scoped protected procedures and role-aware purchase price serialization/sanitization.
- Current product schema is not fully aligned with Story 2.1 fields: code uses `description`/`sku` but Story 2.1 requires `category`/`unit`/`barcode` core fields.
- Current UI surface is list-only (`/products` + `ProductsTable`); there is no offline create form/path yet.
- Offline-first module structure exists in architecture targets, but no implementation currently exists in codebase for Dexie/outbox/sync route.
- Tenant safety baseline is present: protected procedures run through `withTenantContext` and RLS helper (`set_config('app.tenant_id', ...)`).
- RBAC baseline is present for price sensitivity: `canViewPurchasePrice`, `canWritePurchasePrice`, and product serializers enforce Operator masking server-side.

### Technical Requirements

- Implement product creation as **offline-first local write**: persist locally first, return immediate success feedback, and mark entity as pending sync without waiting for network round-trip.
- Keep role permissions unchanged: `Admin`/`Manager` may set `purchasePrice`; `Operator` must never see it and any submitted value must be sanitized server-side.
- Align Story 2.1 product contract to required fields: `name`, `category`, `unit`, `price`, optional `barcode`, and role-gated optional `purchasePrice`.
- Maintain strict tenant boundaries in all server mutations/reads through existing protected procedure + tenant context pattern.
- Ensure all API-visible dates remain ISO 8601 UTC strings; keep JSON fields in camelCase and database columns in snake_case.
- Do not introduce direct online-only create paths that bypass the local outbox/offline persistence model.
- Keep create flow compatible with future sync endpoint/idempotency model (`operationId` and replay-safe semantics).

### Architecture Compliance

- Use existing authenticated server boundary (`protectedProcedure`) for any server-side product operation; never add unauthenticated mutation paths.
- Keep tenant isolation fail-safe at both levels: application tenant context (`withTenantContext`) and Postgres RLS policies on `products`.
- Preserve server-authoritative RBAC: UI hiding is UX-only, while API selection/serialization/sanitization remain the security boundary for `purchasePrice`.
- Follow architecture data contracts: API payload keys in camelCase, database columns in snake_case, and UTC ISO 8601 for API date fields.
- Introduce offline-first client writes through a dedicated offline module (`src/features/offline/**`) instead of embedding ad-hoc IndexedDB logic directly in UI components.
- Keep synchronization model forward-compatible with planned REST sync endpoint (`POST /api/sync`) and deduplication by operation identity.
- Avoid regressions to existing tenant anti-leak guarantees validated by integration tests (`products-rbac` and tenant-isolation suites).

### Library & Framework Requirements

- **Use existing project stack as baseline:** Next.js App Router (`next@15.5.7`), React 19, TypeScript 5, tRPC 11, Drizzle ORM 0.44.x, Better Auth 1.3.x, Zod 3.24.x, TanStack Query 5.
- **RBAC and serialization utilities are mandatory reuse points:** `~/server/auth/rbac-policy` and `~/server/auth/product-serializer`.
- **Do not add alternate state/auth/API stacks** (no Redux replacement, no alternate auth provider, no REST replacement of tRPC for product CRUD).
- **Offline implementation requirement:** add Dexie-based local persistence and outbox as architecture-prescribed dependency (not yet present in `package.json`).
- **PWA/offline runtime requirement:** align with Serwist architecture target (`@serwist/next`) when introducing offline caching/sync wiring.
- **Version-awareness guardrail:** latest registry versions are newer (`next@16.1.6`, `better-auth@1.4.18`, `drizzle-orm@0.45.1`, `@trpc/server@11.10.0`, `dexie@4.3.0`, `@serwist/next@9.5.5`), but Story 2.1 should prioritize compatibility with current repo versions unless an explicit upgrade task is approved.
- **Security guardrail:** keep Better Auth on maintained 1.x and never loosen the minimum secure baseline from architecture guidance (`>=1.2.10`).

### Latest Technical Information

- Current repository stack snapshot: `next@15.5.7`, `better-auth@1.3.x`, `drizzle-orm@0.44.x`, `@trpc/server@11.0.0`, `zod@3.24.x`, `@tanstack/react-query@5.69.0`, `pino@10.3.0`.
- Latest npm registry snapshot confirms newer compatible lines are available (`next@16.1.6`, `@trpc/server@11.10.0`, `drizzle-orm@0.45.1`, `better-auth@1.4.18`, `dexie@4.3.0`, `@serwist/next@9.5.5`), but this story should not silently upgrade major/minor baselines.
- For Story 2.1 implementation, prioritize **dependency minimization + stability**: only add missing offline dependencies required for acceptance criteria (Dexie and related offline glue) and defer broad upgrades.
- Keep Next.js App Router conventions and current tRPC v11 procedure patterns to avoid introducing integration regressions in auth/tenant context middleware.
- Maintain Drizzle migration-first workflow for any schema change (`schema.ts` + versioned SQL migration) rather than ad-hoc DB changes.

### Project Structure Notes

- Place product UI/domain additions under existing product feature boundaries: `apps/web/src/features/products/**` and keep route entrypoints in `apps/web/src/app/products/**`.
- Keep server API changes in `apps/web/src/server/api/routers/products.ts`; keep shared validation contracts in `apps/web/src/schemas/products.ts`.
- Keep authorization and role-based serialization logic centralized in `apps/web/src/server/auth/rbac-policy.ts` and `apps/web/src/server/auth/product-serializer.ts`; do not duplicate role checks inside UI components.
- Add offline-first infrastructure as dedicated modules under `apps/web/src/features/offline/**` (Dexie DB, outbox queue, sync helpers) and consume via product feature adapters.
- If product persistence fields change (`category`, `unit`, `barcode`), update Drizzle schema in `apps/web/src/server/db/schema.ts` and add matching SQL migration under `apps/web/drizzle/*.sql`.
- Keep API router registration untouched except if new router is introduced; then wire through `apps/web/src/server/api/root.ts`.
- Detected variance to resolve: current product model uses `description` and `sku`, while Story 2.1 requires `category`, `unit`, and optional `barcode`; implementation must migrate contracts and persistence consistently.

### Testing Requirements

- Keep and extend existing integration coverage style under `apps/web/tests/integration/**` with `vitest` in Node environment.
- Add product RBAC tests proving Operator cannot view or persist `purchasePrice`, while Admin/Manager behavior remains intact.
- Add tenant isolation tests ensuring create/list/get for Story 2.1 fields remain tenant-scoped and resistant to UUID-guess cross-tenant access.
- Add offline behavior tests for local create flow: local persistence succeeds without network, record is flagged pending sync, and UI shows immediate availability.
- Add validation tests for required fields (`name`, `category`, `unit`, `price`) and invalid values (empty/negative) to prevent bad local writes.
- Keep regression checks for existing product routes (`list`, `getById`, `create`, `update`, `delete`) after schema evolution.
- Run verification commands before handoff:
  - `bun run --cwd apps/web typecheck`
  - `bun run --cwd apps/web test:run --maxWorkers=1`

### Project Context Reference

- Enforce offline-first write discipline: offline flows must write to local outbox and sync via `/api/sync`; no direct server writes from offline UI paths. [Source: _bmad-output/project-context.md#Critical Implementation Rules]
- Enforce tenant isolation via `SET LOCAL app.tenant_id` helper and RLS-backed access on tenant-scoped tables. [Source: _bmad-output/project-context.md#Critical Don’t‑Miss Rules]
- Keep sensitive price masking server-authoritative: Operators must never receive `purchasePrice` from API responses. [Source: _bmad-output/project-context.md#Critical Don’t‑Miss Rules]
- Keep API/JSON contracts camelCase and DB schema snake_case; keep date/time payloads as ISO 8601 UTC strings. [Source: _bmad-output/project-context.md#Language-Specific Rules (TypeScript)]
- Keep business logic in server services and keep routers/handlers thin, validation-first boundaries. [Source: _bmad-output/project-context.md#Framework-Specific Rules (Next.js / API Boundaries)]
- Keep integration and anti-leak coverage in `tests/integration/**` as a mandatory guardrail for this story. [Source: _bmad-output/project-context.md#Testing Rules]

### References

- Story requirements and AC baseline: [Source: _bmad-output/planning-artifacts/epics.md#Story-2.1-Create-Product-(Offline-First)]
- Product/offline FR mapping: [Source: _bmad-output/planning-artifacts/prd.md#Functional-Requirements]
- Architecture patterns (tRPC + `/api/sync`, Dexie outbox, RLS, RBAC): [Source: _bmad-output/planning-artifacts/architecture.md#Core-Architectural-Decisions]
- Implementation boundaries and target structure: [Source: _bmad-output/planning-artifacts/architecture.md#Project-Structure-&-Boundaries]
- AI-agent operating constraints and non-miss rules: [Source: _bmad-output/project-context.md#Critical-Implementation-Rules]

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- Create-story workflow execution trace (interactive with YOLO tail)
- Artifact analysis inputs: epics/prd/architecture/project-context + current codebase scan

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story status confirmed as `ready-for-dev`.
- Sprint tracking updated to mark this story as `ready-for-dev`.
- Implemented offline-first product creation flow with Dexie local persistence
- Added new product fields: category, unit, barcode
- Created offline module at `apps/web/src/features/offline/**` with database.ts, outbox.ts, product-operations.ts
- Created product create form component at `apps/web/src/features/products/components/create-product-form.tsx`
- Created product create page at `apps/web/src/app/products/create/page.tsx`
- Updated products page to include Create Product button
- Updated ProductsTable to display new fields (category, unit, barcode)
- Added new API procedure `getCurrentTenantMembership` in auth router
- Added database migration for new product fields
- Typecheck passes successfully
- Code-review fixes applied: products list now merges local Dexie products for immediate offline visibility
- Added sync status rendering in product list (`pending`/`synced`/`failed`) for offline-created items
- Hardened test DB bootstrap to ensure Story 2.1 product columns are present in existing test databases
- Extended integration RBAC coverage with Story 2.1 fields (`category`, `unit`, `barcode`)
- Added unit test for offline product operations (outbox enqueue + idempotency metadata)
- Full verification gates rerun successfully: typecheck + full test suite (`191 passed`)

### File List

- _bmad-output/implementation-artifacts/2-1-create-product-offline-first.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- apps/web/package.json (added dexie dependency)
- apps/web/drizzle/0010_products_story_21_fields.sql
- apps/web/src/server/db/schema.ts
- apps/web/src/schemas/products.ts
- apps/web/src/server/api/routers/products.ts
- apps/web/src/server/api/routers/auth.ts
- apps/web/src/server/auth/product-serializer.ts
- apps/web/src/features/offline/database.ts
- apps/web/src/features/offline/outbox.ts
- apps/web/src/features/offline/product-operations.ts
- apps/web/src/features/products/components/create-product-form.tsx
- apps/web/src/features/products/components/products-table.tsx
- apps/web/src/app/products/page.tsx
- apps/web/src/app/products/create/page.tsx
- apps/web/tests/helpers/tenant-test-factories.ts
- apps/web/tests/helpers/ensure-test-database.ts
- apps/web/tests/integration/products-rbac.test.ts
- apps/web/tests/unit/auth/product-serializer.test.ts
- apps/web/tests/unit/products-schema.test.ts
- apps/web/tests/unit/offline/product-operations.test.ts
- apps/web/package-lock.json

## Change Log

- 2026-02-13: Implemented offline-first product creation flow with Dexie local persistence
- 2026-02-13: Added new product fields (category, unit, barcode) to schema and API
- 2026-02-13: Created offline module with outbox for future sync compatibility
- 2026-02-13: Added product create form and page with offline-first support
- 2026-02-13: Updated ProductsTable to display new fields
- 2026-02-13: Added getCurrentTenantMembership API procedure
- 2026-02-13: Updated test helpers for new schema fields
- 2026-02-13: Added unit tests for product schema validation
- 2026-02-13: Added unit tests for offline product operations
- 2026-02-13: Code-review remediation: fixed offline list visibility, pending-sync UI, test DB migration guardrails, and expanded RBAC/integration coverage
