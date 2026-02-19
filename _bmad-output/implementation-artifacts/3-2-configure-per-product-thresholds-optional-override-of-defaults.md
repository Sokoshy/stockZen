# Story 3.2: Configure Per-Product Thresholds (Optional Override of Defaults)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a tenant user,
I want to optionally override stock thresholds per product,
so that I can tailor alerts for products with different criticality.

## Acceptance Criteria

1. **Given** tenant default thresholds exist
   **When** I view a product's threshold settings
   **Then** I can see whether the product is using tenant defaults or a custom override

2. **Given** I am authenticated as `Admin`, `Manager`, or `Operator`
   **When** I choose "Use tenant defaults" for a product
   **Then** the product has no custom thresholds
   **And** alerting uses the tenant default `criticalThreshold` and `attentionThreshold`

3. **Given** I am authenticated as `Admin`, `Manager`, or `Operator`
   **When** I choose "Customize thresholds" for a product and set `criticalThreshold` and `attentionThreshold`
   **Then** the custom thresholds are saved for that product
   **And** the system enforces `criticalThreshold < attentionThreshold`

4. **Given** I switch a product from custom thresholds back to tenant defaults
   **When** I confirm the change
   **Then** the product's custom thresholds are removed
   **And** future alerting uses tenant defaults

5. **Given** invalid thresholds are submitted (missing, non-numeric, `<= 0`, or `critical >= attention`)
   **When** I attempt to save custom thresholds
   **Then** the system rejects with clear validation errors
   **And** no custom thresholds are persisted

## Tasks / Subtasks

- [x] Add per-product custom threshold persistence model with safe migration path (AC: 2, 3, 4, 5)
  - [x] Add nullable product-level fields for custom override thresholds (critical + attention) in Drizzle schema and SQL migration
  - [x] Add DB-level check constraints for valid override pairs (`> 0`, `critical < attention`) while still allowing "no custom override" state
  - [x] Preserve existing `lowStockThreshold` compatibility during transition and avoid breaking current product CRUD/offline records

- [x] Extend shared product validation contracts for explicit threshold mode semantics (AC: 1, 2, 3, 4, 5)
  - [x] Update `apps/web/src/schemas/products.ts` with fields and validation for custom threshold payloads
  - [x] Introduce explicit mode in DTO/form layer (`defaults` vs `custom`) and normalize payload server-side
  - [x] Ensure validation errors are field-specific and consistent across API + forms

- [x] Implement product threshold update/read behavior in tRPC with role-consistent writes (AC: 1, 2, 3, 4, 5)
  - [x] Update product `create`/`update` procedure handling to persist or clear custom thresholds according to selected mode
  - [x] Return threshold mode and effective thresholds in product responses used by edit/view screens
  - [x] Keep RBAC consistent with current product editing rules (`Admin`/`Manager`/`Operator` allowed except existing purchasePrice constraints)

- [x] Update product create/edit UI to support default/custom threshold selection (AC: 1, 2, 3, 4, 5)
  - [x] Add a clear control that shows current mode and allows switching between "Use tenant defaults" and "Customize thresholds"
  - [x] Add custom threshold inputs with inline validation and disable submit on invalid combinations
  - [x] Require explicit confirmation before clearing existing custom thresholds when switching back to defaults

- [x] Apply effective threshold computation in current alert/filter paths without regressions (AC: 2, 3, 4)
  - [x] Introduce a shared helper to resolve effective thresholds: `custom` override when present, otherwise tenant defaults
  - [x] Update product filter/alert utility usage to read effective attention threshold consistently
  - [x] Keep offline list rendering and merged local/server product rows behavior stable

- [x] Extend offline sync and local persistence for threshold overrides (AC: 2, 3, 4, 5)
  - [x] Update Dexie `LocalProduct` shape and outbox payloads to include custom threshold fields and mode intent
  - [x] Update sync-service create/update processors to persist custom thresholds and clear them on defaults mode
  - [x] Preserve idempotency and server-authoritative conflict handling for threshold fields

- [x] Add comprehensive verification coverage and run quality gates (AC: 1, 2, 3, 4, 5)
  - [x] Unit tests: product schema validation and threshold resolver utility (`defaults/custom`, invalid ranges, clearing behavior)
  - [x] Integration tests: product CRUD threshold behavior, tenant isolation, invalid payload rejection, role behavior
  - [x] UI tests: mode toggle, validation rendering, clear-confirmation flow, successful save
  - [x] Regression gates: `bun run --cwd apps/web typecheck` ✅ and `bun run --cwd apps/web test:run tests/unit` ✅

## Dev Notes

### Developer Context

Story 3.2 builds directly on Story 3.1. Tenant default thresholds are now persisted and editable; this story adds optional per-product overrides without breaking the existing product and offline flows.

Current implementation reality:

- Tenant defaults exist and are available via `tenantThresholds.getTenantDefaultThresholds`.
- Product model currently only has one optional threshold field (`lowStockThreshold`) and no explicit `critical/attention` override pair.
- Product list alert filtering currently depends on `lowStockThreshold ?? tenantDefaultAttentionThreshold`.
- Create/edit product forms already expose `lowStockThreshold`; they do not support a defaults/custom mode or custom pair validation.

Developer objective for this story:

- Introduce per-product override semantics (`defaults` or `custom`) with two custom thresholds.
- Make UI behavior explicit and safe when toggling back to defaults (clear custom values intentionally).
- Keep compatibility for existing products and offline data during transition.

### Technical Requirements

- Model per-product threshold overrides as optional custom fields; "use tenant defaults" must be represented as no custom threshold pair.
- Enforce validation rules in both schema and persistence layers:
  - custom thresholds must be numeric integers and `> 0`
  - custom `criticalThreshold < attentionThreshold`
  - invalid/incomplete custom pairs are rejected and never persisted
- Expose threshold mode and effective thresholds to UI (`defaults` vs `custom`) so users can see active behavior.
- Support all three authenticated roles (`Admin`, `Manager`, `Operator`) for threshold mode changes, aligned with current product edit permissions.
- On switch to defaults, remove custom thresholds (set override fields to null) and ensure later alerting uses tenant defaults.

### Architecture Compliance

- Keep routers thin and keep business logic in shared helpers/services under `apps/web/src/server/**`.
- Preserve tenant isolation and RLS guarantees for all product reads/writes.
- Keep API contracts in `camelCase`; do not leak DB `snake_case` details.
- Keep `/api/sync` contract stable (`{ checkpoint, results }`), extending payload fields only where needed for product operations.
- Respect server/client boundaries: no client import from `src/server/**`.

### Library & Framework Requirements

- Stay on project-pinned stack for this story: Next.js 15.5.7, tRPC 11.0.0, Drizzle 0.44.x, Better Auth 1.3.x, Zod 3.24.2, Dexie 4.3.0.
- Do not couple Story 3.2 with dependency upgrades; isolate major upgrades to dedicated PRs.
- Reuse existing React Hook Form + Zod resolver pattern already used in product forms and tenant-threshold form.

### File Structure Requirements

Expected touch points for Story 3.2:

- `apps/web/drizzle/*.sql` (new migration for product custom thresholds)
- `apps/web/src/server/db/schema.ts` (products table model update)
- `apps/web/src/schemas/products.ts` (input/output schema updates for threshold mode/custom values)
- `apps/web/src/server/api/routers/products.ts` (create/update/list/getById behavior for threshold mode/fields)
- `apps/web/src/features/products/components/create-product-form.tsx` (mode toggle + custom fields)
- `apps/web/src/features/products/components/edit-product-form.tsx` (mode toggle + custom fields + clear confirm)
- `apps/web/src/features/products/utils/filter-utils.ts` (effective threshold helper)
- `apps/web/src/features/offline/database.ts` and `apps/web/src/features/offline/product-operations.ts` (local persistence and outbox payload shape)
- `apps/web/src/server/services/sync-service.ts` (apply/persist custom threshold fields from offline sync)

### Testing Requirements

- Unit tests for schema and threshold resolver logic.
- Integration tests for product threshold CRUD semantics, role behavior, invalid payload rejection, and tenant isolation.
- UI tests for mode switching, validation states, clear-confirmation flow, and save success/error behavior.
- Offline sync tests ensuring custom thresholds round-trip via outbox and server processing.
- Run and pass:
  - `bun run --cwd apps/web typecheck`
  - `bun run --cwd apps/web test:run --maxWorkers=1`

### Previous Story Intelligence

- Story 3.1 introduced a strong pattern to follow: DB migration + Zod schema + dedicated API handling + UI + tests at each layer.
- Threshold-related code paths already exist in:
  - `apps/web/src/server/api/routers/tenant-thresholds.ts`
  - `apps/web/src/features/products/utils/filter-utils.ts`
  - `apps/web/src/features/products/hooks/use-product-filters.ts`
  - `apps/web/src/features/products/components/products-list-client.tsx`
- Reuse Story 3.1 testing discipline and keep scope focused; avoid hidden side effects in unrelated modules.

### Git Intelligence Summary

- Recent commit progression shows expected implementation cadence:
  1) schema + validation,
  2) API router + coverage,
  3) feature wiring,
  4) UI + tests,
  5) artifact/status update.
- Story 3.2 should follow same cadence to minimize integration risk.

### Latest Tech Information

- Latest stable versions are higher than project pins (Next 16.x, Drizzle 0.45.x, Better Auth 1.4.x, Zod 4.x), but this story must stay on current pinned versions.
- No upgrade work should be mixed into this story because threshold override touches auth-scoped API, offline sync, and schema contracts simultaneously.

### Project Context Reference

Mandatory guardrails from project context:

- Use Bun workflows and keep lockfile/tooling conventions unchanged.
- Keep Zod schemas centralized in `src/schemas/**` and shared by server + forms.
- Enforce tenancy via RLS context and protected membership checks.
- Keep tRPC as internal contract and keep REST usage limited to `/api/sync`.
- Keep logs structured and avoid PII/secrets.

### Story Completion Status

- Story status: `ready-for-dev`
- Completion note: `Ultimate context engine analysis completed - comprehensive developer guide created`

### Project Structure Notes

- Proposed implementation aligns with current feature-first structure and established Epic 3 patterns.
- Main variance to manage: transition from legacy single `lowStockThreshold` to explicit override pair; migration and compatibility strategy must avoid regressions in offline and filters.

### References

- Story 3.2 requirements and BDD acceptance criteria: [Source: _bmad-output/planning-artifacts/epics.md#Story-3.2-Configure-Per-Product-Thresholds-Optional-Override-of-Defaults]
- Epic 3 sequencing and downstream alerting dependencies: [Source: _bmad-output/planning-artifacts/epics.md#Epic-3-Thresholds--Alerting-Actionable-Alerts]
- FR context for threshold behavior: [Source: _bmad-output/planning-artifacts/prd.md#Functional-Requirements]
- Architecture constraints and boundaries (RLS, tRPC, offline/sync, structure): [Source: _bmad-output/planning-artifacts/architecture.md#Core-Architectural-Decisions], [Source: _bmad-output/planning-artifacts/architecture.md#Implementation-Patterns--Consistency-Rules], [Source: _bmad-output/planning-artifacts/architecture.md#Project-Structure--Boundaries]
- Project guardrails: [Source: _bmad-output/project-context.md#Critical-Dont-Miss-Rules], [Source: _bmad-output/project-context.md#Framework-Specific-Rules-Nextjs--API-Boundaries]
- Story 3.1 learnings and implementation baseline: [Source: _bmad-output/implementation-artifacts/3-1-configure-account-default-stock-thresholds-absolute-quantities.md]
- Current threshold-related implementation files: [Source: apps/web/src/server/db/schema.ts], [Source: apps/web/src/schemas/products.ts], [Source: apps/web/src/server/api/routers/products.ts], [Source: apps/web/src/features/products/utils/filter-utils.ts], [Source: apps/web/src/features/products/components/create-product-form.tsx], [Source: apps/web/src/features/products/components/edit-product-form.tsx], [Source: apps/web/src/features/offline/database.ts], [Source: apps/web/src/features/offline/product-operations.ts], [Source: apps/web/src/server/services/sync-service.ts]

## Dev Agent Record

### Agent Model Used

opencode/glm-5-free

### Debug Log References

- create-story workflow execution (YOLO mode enabled for remaining document generation)
- artifact analysis: epics/prd/architecture/ux/project-context
- implementation baseline analysis from Story 3.1 and current product/offline/sync code
- recent git commit pattern analysis for Epic 3

### Completion Notes List

- Story context generated with full AC mapping, implementation task breakdown, architecture guardrails, and test requirements.
- Story remains `ready-for-dev` and sprint status update is pending Step 6 of workflow.
- **2026-02-19 Implementation Session:**
  - ✅ Completed: DB migration (0013_add_product_custom_thresholds.sql)
  - ✅ Completed: Drizzle schema update with customCriticalThreshold and customAttentionThreshold fields
  - ✅ Completed: Zod schema validation with thresholdMode and custom threshold validation
  - ✅ Completed: Products router update for create/update with threshold mode handling
  - ✅ Completed: Product serializer with thresholdMode derivation
  - ✅ Completed: Filter utils with resolveEffectiveThresholds helper
  - ✅ Completed: Offline sync support (LocalProduct, product-operations, sync-service)
  - ✅ Completed: UI updates for threshold mode selection (create/edit forms)
  - ✅ Completed: Unit tests for threshold resolver and schema validation (187 tests passing)
  - ✅ Completed: TypeScript typecheck passing
  - ✅ Completed: Test database helper updated with ensureProductCustomThresholdColumns
  - ✅ Completed: Review remediation for strict update/sync validation and DB pair completeness
  - ✅ Completed: Added integration and UI regression coverage for threshold mode/error paths

### File List

- `_bmad-output/implementation-artifacts/3-2-configure-per-product-thresholds-optional-override-of-defaults.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `apps/web/drizzle/0013_add_product_custom_thresholds.sql`
- `apps/web/drizzle/0014_enforce_custom_threshold_pair.sql`
- `apps/web/drizzle/meta/_journal.json`
- `apps/web/src/server/db/schema.ts`
- `apps/web/src/schemas/products.ts`
- `apps/web/src/server/api/routers/products.ts`
- `apps/web/src/server/auth/product-serializer.ts`
- `apps/web/src/features/products/utils/filter-utils.ts`
- `apps/web/src/features/offline/database.ts`
- `apps/web/src/features/offline/product-operations.ts`
- `apps/web/src/features/offline/movement-operations.ts`
- `apps/web/src/server/services/sync-service.ts`
- `apps/web/src/features/products/components/create-product-form.tsx`
- `apps/web/src/features/products/components/edit-product-form.tsx`
- `apps/web/tests/unit/auth/product-serializer.test.ts`
- `apps/web/tests/unit/products/filter-utils.test.ts`
- `apps/web/tests/unit/products/product-threshold-forms.test.tsx`
- `apps/web/tests/unit/products-schema.test.ts`
- `apps/web/tests/integration/products-crud.test.ts`
- `apps/web/tests/integration/sync-route.test.ts`
- `apps/web/tests/helpers/ensure-test-database.ts`
