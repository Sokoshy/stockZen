# Story 3.3: Automatic Alert Generation + R/O/G Classification (One Active Alert per Product)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a tenant user,
I want alerts to be generated automatically when stock crosses thresholds,
so that I can see which products need attention without manual monitoring.

## Acceptance Criteria

1. **Given** a product has an effective `criticalThreshold` and `attentionThreshold` (default or override)
   **When** the system computes current stock for that product
   **Then** the product alert level is classified as:
   **And** `red` if `stock <= criticalThreshold`
   **And** `orange` if `criticalThreshold < stock <= attentionThreshold`
   **And** `green` if `stock > attentionThreshold`

2. **Given** a product transitions from `green` to `orange` or `red`
   **When** the threshold is reached due to movements or sync updates
   **Then** the system creates an active alert for that product (if none exists)
   **And** the alert is visually classified by criticality (Red/Orange/Green)

3. **Given** an active alert already exists for a product
   **When** the product's alert level changes
   **Then** the same alert is updated (level, timestamps, current stock)
   **And** no additional active alert is created for that product

4. **Given** a product returns to `green`
   **When** stock becomes `> attentionThreshold`
   **Then** the system automatically closes the active alert for that product

## Tasks / Subtasks

- [x] Add durable alert persistence with one-active-alert guardrail (AC: 2, 3, 4)
  - [x] Add Drizzle migration for alert domain (enum(s), `alerts` table, lifecycle timestamps, stock snapshot fields)
  - [x] Add partial unique index to enforce one active alert per `(tenant_id, product_id)`
  - [x] Add query indexes for tenant-scoped active alert reads (`tenant_id`, `status`, `level`, `updated_at`)

- [x] Implement canonical alert classification logic using effective thresholds (AC: 1)
  - [x] Add a shared server helper that computes `red`/`orange`/`green` from current stock and effective thresholds
  - [x] Reuse existing threshold resolution semantics from Story 3.2 (`custom` override vs tenant defaults)
  - [x] Keep boundary behavior exact: `<= critical => red`, `<= attention => orange`, `> attention => green`

- [x] Implement alert lifecycle orchestration in stock update paths (AC: 2, 3, 4)
  - [x] Extend `inventory-service` movement transaction to classify and create/update/close alert atomically with quantity update
  - [x] Extend `/api/sync` stock movement processing path to run the same lifecycle logic
  - [x] Ensure duplicate sync retries (same idempotency key) do not create duplicate active alerts

- [x] Re-evaluate alerts when threshold inputs change (AC: 1, 3, 4)
  - [x] Recompute affected product alert state when product threshold mode/values are updated
  - [x] Recompute affected product alert state when tenant defaults are updated
  - [x] Ensure recomputation updates existing active alert in place and closes it when state is `green`

- [x] Expose alert state for UI consumption with role-safe payloads (AC: 2, 3)
  - [x] Extend product output model with alert presentation fields (e.g., `alertLevel`, `hasActiveAlert`, `activeAlertUpdatedAt`)
  - [x] Keep `Operator` purchase-price restrictions unchanged while adding alert metadata
  - [x] Add R/O/G alert indicators in product list cards/table rows without breaking existing offline status badges

- [x] Add verification coverage and run quality gates (AC: 1, 2, 3, 4)
  - [x] Unit tests for classification boundaries and threshold-source combinations (`defaults`/`custom`)
  - [x] Integration tests for alert lifecycle transitions (create, update-in-place, close), one-active-alert invariant, and tenant isolation
  - [x] Sync integration tests for idempotent replay and alert lifecycle behavior after server-authoritative updates
  - [x] UI tests for R/O/G rendering and transition behavior from updated product payloads
  - [x] Run `bun run --cwd apps/web typecheck` and `bun run --cwd apps/web test:run --maxWorkers=1`

## Dev Notes

### Developer Context

Story 3.3 is the first persistent alert lifecycle story in Epic 3. Story 3.1 introduced tenant default thresholds and Story 3.2 introduced optional per-product custom thresholds. This story must convert threshold state + stock state into durable, reliable alert state with strict one-active-alert-per-product behavior.

Current implementation reality:

- Products currently store quantity + threshold fields (`lowStockThreshold`, `customCriticalThreshold`, `customAttentionThreshold`), but no dedicated alert table exists.
- Product list currently derives an on-alert boolean from threshold comparisons in client utilities; no server-side persistent alert lifecycle exists.
- Stock changes occur through both online movement creation (`inventory-service`) and offline sync replay (`sync-service`), so lifecycle orchestration must be consistent in both paths.
- Epic 4 dashboards depend on trustworthy active-alert data; Story 3.3 provides this foundational state.

### Technical Requirements

- Alert classification must always use effective thresholds for each product:
  - custom pair when present and valid
  - otherwise tenant defaults
- Classification rules are strict and exhaustive:
  - `red` if `stock <= criticalThreshold`
  - `orange` if `criticalThreshold < stock <= attentionThreshold`
  - `green` if `stock > attentionThreshold`
- Exactly one active alert per product:
  - create active alert on transition `green -> orange/red` when none exists
  - update same active alert when level changes while still non-green
  - close active alert automatically on transition to `green`
- Lifecycle updates must run inside the same transaction as stock updates to avoid drift.
- Lifecycle logic must be idempotent across sync retries and safe against concurrent updates.

### Architecture Compliance

- Keep routers thin and keep alert business logic in `apps/web/src/server/services/**`.
- Preserve tenant isolation and RLS expectations in all alert queries/mutations.
- Keep DB naming in `snake_case`, API payloads in `camelCase`.
- Keep `/api/sync` contract stable (`{ checkpoint, results }`) while extending internal server processing.
- Respect server/client boundaries: no client imports from `src/server/**`.
- Maintain structured JSON logging and avoid sensitive data leakage.

### Library & Framework Requirements

- Continue with project-pinned stack for this story:
  - Next.js `15.5.7`
  - tRPC `11.0.0`
  - Drizzle `0.44.x`
  - Better Auth `1.3.x` (and keep policy `>= 1.2.10`)
  - Zod `3.24.2`
  - Dexie `4.3.0`
- Do not bundle dependency upgrades with Story 3.3; keep scope on alert lifecycle correctness.

### File Structure Requirements

Expected touch points:

- `apps/web/drizzle/0015_*.sql` (new alert table + constraints/indexes)
- `apps/web/src/server/db/schema.ts` (alert model and relations)
- `apps/web/src/schemas/alerts.ts` (new DTO/contracts)
- `apps/web/src/server/services/alert-service.ts` (new classification + lifecycle orchestration)
- `apps/web/src/server/services/inventory-service.ts` (invoke lifecycle within movement transaction)
- `apps/web/src/server/services/sync-service.ts` (invoke lifecycle for synced stock updates)
- `apps/web/src/server/api/routers/products.ts` (include alert metadata in product payloads)
- `apps/web/src/features/products/utils/filter-utils.ts` (shared classification alignment for client)
- `apps/web/src/features/products/components/products-table.tsx` and `apps/web/src/features/products/components/mobile-product-list.tsx` (visual R/O/G indicators)

### Testing Requirements

- Unit tests:
  - classification boundaries (`red`, `orange`, `green`) and threshold-source combinations
  - lifecycle state machine transitions
- Integration tests:
  - movement-driven transitions create/update/close active alerts correctly
  - one-active-alert uniqueness is enforced
  - cross-tenant access/isolation for alerts
- Sync tests:
  - idempotent replay does not duplicate active alerts
  - conflict/server-authoritative paths still produce correct final alert state
- UI tests:
  - product list/card renders R/O/G consistently
  - transitions reflected after stock updates and sync completion
- Run and pass:
  - `bun run --cwd apps/web typecheck`
  - `bun run --cwd apps/web test:run --maxWorkers=1`

### Previous Story Intelligence

- Story 3.1 established tenant default threshold persistence and Admin-only update flow in `tenant-thresholds` router.
- Story 3.2 added product-level custom threshold pair and explicit `thresholdMode` semantics with strong validation.
- Existing helper `resolveEffectiveThresholds` in product filter utils already codifies defaults/custom precedence and should be reused rather than duplicated.
- Recent Story 3.2 implementation pattern (migration -> schemas -> router/service -> offline/sync -> tests) should be repeated for minimal regression risk.

### Git Intelligence Summary

- Recent commit sequence shows useful execution cadence:
  1. enforce offline/sync correctness,
  2. improve UX + shared helper behavior,
  3. strengthen schema/UI/integration coverage,
  4. update implementation artifacts/status.
- Actionable for 3.3: implement alert lifecycle in server + sync first, then wire UI indicators, then close with broad tests.

### Latest Tech Information

Latest registry snapshot (research timestamp: 2026-02-20):

- `next`: `16.1.6` (project pinned `15.5.7`)
- `@trpc/server`: `11.10.0` (project pinned `11.0.0`)
- `drizzle-orm`: `0.45.1` (project pinned `0.44.x`)
- `better-auth`: `1.4.18` (project pinned `1.3.x`, maintain `>= 1.2.10`)
- `zod`: `4.3.6` (project pinned `3.24.2`)
- `dexie`: `4.3.0` (project aligned)

Guidance for this story:

- Keep current pinned versions to avoid mixing lifecycle feature risk with upgrade risk.
- If upgrades are needed, isolate them to a dedicated PR and revalidate auth, sync, and tenant boundaries.

### Project Context Reference

Mandatory guardrails from project context:

- Keep Bun package-management workflow and lockfile conventions.
- Use centralized schemas and avoid validation duplication across client/server.
- Keep server authoritative for security and tenancy boundaries.
- Never bypass tenant/RLS context on tenant-scoped tables.
- Keep offline writes through outbox + `/api/sync`; preserve idempotency semantics.
- Maintain structured logs with secret/PII redaction.

### Story Completion Status

- Story status: `done`
- Completion note: `Implementation hardened after adversarial review; acceptance criteria and verification coverage are now complete`

### Project Structure Notes

- Proposed changes align with the architecture's service-first backend boundaries and feature-first frontend structure.
- Main risk area is lifecycle consistency across online + offline/sync paths; shared alert service usage should avoid split logic.

### References

- Story 3.3 requirements and BDD acceptance criteria: [Source: _bmad-output/planning-artifacts/epics.md#Story-3.3-Automatic-Alert-Generation--ROG-Classification-One-Active-Alert-per-Product]
- Epic 3 sequencing and dependencies with threshold stories: [Source: _bmad-output/planning-artifacts/epics.md#Epic-3-Thresholds--Alerting-Actionable-Alerts]
- FR9/FR10 alerting requirements baseline: [Source: _bmad-output/planning-artifacts/prd.md#Functional-Requirements]
- Architecture constraints and implementation boundaries: [Source: _bmad-output/planning-artifacts/architecture.md#Core-Architectural-Decisions], [Source: _bmad-output/planning-artifacts/architecture.md#Implementation-Patterns--Consistency-Rules], [Source: _bmad-output/planning-artifacts/architecture.md#Project-Structure--Boundaries]
- UX R/O/G and alerts-first design intent: [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Visual-Design-Foundation], [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-Consistency-Patterns]
- Project implementation guardrails: [Source: _bmad-output/project-context.md#Critical-Dont-Miss-Rules], [Source: _bmad-output/project-context.md#Framework-Specific-Rules-Nextjs--API-Boundaries]
- Existing threshold and stock-movement implementation context: [Source: apps/web/src/schemas/products.ts], [Source: apps/web/src/features/products/utils/filter-utils.ts], [Source: apps/web/src/server/services/inventory-service.ts], [Source: apps/web/src/server/services/sync-service.ts], [Source: apps/web/src/server/api/routers/products.ts], [Source: apps/web/src/server/api/routers/stock-movements.ts]
- Previous story baselines and learnings: [Source: _bmad-output/implementation-artifacts/3-1-configure-account-default-stock-thresholds-absolute-quantities.md], [Source: _bmad-output/implementation-artifacts/3-2-configure-per-product-thresholds-optional-override-of-defaults.md]

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- create-story workflow execution for Story 3.3 (auto-selected from sprint backlog)
- exhaustive artifact analysis: epics, PRD, architecture, UX, project-context
- previous-story intelligence extraction from Story 3.1 and Story 3.2 implementation artifacts
- git intelligence analysis from the 5 most recent commits
- latest dependency/version snapshot lookup for implementation risk awareness

### Completion Notes List

- Story context generated with explicit lifecycle-state requirements to prevent duplicate alerts and threshold drift.
- Tasks include both online and offline/sync reconciliation paths to avoid implementation gaps.
- Story is ready for development and aligned with Epic 4 dependency needs.
- ✅ Implemented alert persistence with `alerts` table, alert_level/alert_status enums, and partial unique index for one-active-alert-per-product invariant.
- ✅ Created `alert-service.ts` with canonical classification logic (`classifyAlertLevel`, `resolveEffectiveThresholds`) and lifecycle orchestration (`updateAlertLifecycle`, `recomputeAlertsForProducts`).
- ✅ Integrated alert lifecycle into `inventory-service.ts` and `sync-service.ts` for atomic stock update + alert state management.
- ✅ Added alert recomputation when product thresholds or tenant defaults change via `products.ts` and `tenant-thresholds.ts` routers.
- ✅ Extended product output schema with alert metadata (`alertLevel`, `hasActiveAlert`, `activeAlertUpdatedAt`) and updated products router to include alert data.
- ✅ Added R/O/G visual indicators in products-table.tsx and swipeable-product-card.tsx.
- ✅ Added unit tests for classification boundaries and threshold resolution logic.
- ✅ All 363 tests pass, typecheck passes.
- ✅ Hardened stock updates against lost-update races by using atomic DB increments in movement and sync paths.
- ✅ Replaced alert create/update race window with a single upsert path guarded by partial-index conflict handling.
- ✅ Added alert recomputation for sync-driven threshold updates (and create path initialization) to prevent stale alert state.
- ✅ Expanded verification with lifecycle + idempotency integration tests and UI badge rendering/transition tests.

### File List

- `_bmad-output/implementation-artifacts/3-3-automatic-alert-generation-r-o-g-classification-one-active-alert-per-product.md`
- `apps/web/drizzle/0015_alerts_table.sql` (new)
- `apps/web/src/server/db/schema.ts` (modified - added alerts table, relations, types)
- `apps/web/src/schemas/alerts.ts` (new)
- `apps/web/src/schemas/products.ts` (modified - added alert metadata schemas)
- `apps/web/src/server/services/alert-service.ts` (new)
- `apps/web/src/server/services/inventory-service.ts` (modified - integrated alert lifecycle)
- `apps/web/src/server/services/sync-service.ts` (modified - integrated alert lifecycle)
- `apps/web/src/server/api/routers/products.ts` (modified - added alert metadata and always expose computed R/O/G classification)
- `apps/web/src/server/api/routers/tenant-thresholds.ts` (modified - added alert recomputation on threshold change)
- `apps/web/src/features/products/utils/filter-utils.ts` (modified - added alert fields to ProductRow)
- `apps/web/src/features/products/components/products-table.tsx` (modified - added R/O/G badges)
- `apps/web/src/features/products/components/swipeable-product-card.tsx` (modified - added R/O/G badges)
- `apps/web/src/features/products/components/products-list-client.tsx` (modified - updated to use alert metadata and custom thresholds)
- `apps/web/tests/unit/alerts/alert-service.test.ts` (new)
- `apps/web/tests/unit/products/filter-utils.test.ts` (modified - added alert fields)
- `apps/web/tests/e2e/products-filters.test.ts` (modified - added alert fields)
- `apps/web/tests/integration/stock-movements.test.ts` (modified - added alert lifecycle + idempotent replay coverage)
- `apps/web/tests/integration/sync-route.test.ts` (modified - added sync replay + threshold recompute alert coverage)
- `apps/web/tests/ui/products-alert-badges.test.tsx` (new)
- `apps/web/tests/helpers/ensure-test-database.ts` (modified - added alerts table setup)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)
