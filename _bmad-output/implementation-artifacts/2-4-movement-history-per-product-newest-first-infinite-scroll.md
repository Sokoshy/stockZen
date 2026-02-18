# Story 2.4: Movement History per Product (Newest-First + Infinite Scroll)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a tenant user,
I want to view a product's stock movement history sorted newest to oldest with infinite scroll,
so that I can quickly understand what happened recently, even when offline.

## Acceptance Criteria

1. **Given** I am authenticated as `Admin`, `Manager`, or `Operator`
   **When** I open a product's movement history
   **Then** I see movements sorted newest-first
   **And** each item shows at least: movement `type` (`entry`/`exit`), `quantity`, and timestamp

2. **Given** I have many movements for a product
   **When** I scroll the history
   **Then** the UI loads the next page automatically (infinite scroll)
   **And** the UI remains responsive

3. **Given** I am offline
   **When** I view a product's movement history
   **Then** I can browse locally stored movements
   **And** newly recorded offline movements appear immediately in the history in correct order
   **And** items pending sync are visibly distinguishable (for example, status badge)

4. **Given** a user has no movements for a product
   **When** they open movement history
   **Then** an empty state explains there is no history yet
   **And** a clear CTA is provided to record a movement

## Tasks / Subtasks

- [x] Implement movement history retrieval API with deterministic newest-first ordering (AC: 1, 2)
  - [x] Extend `stockMovements.listByProduct` for cursor-based pagination using stable ordering (`createdAt DESC`, tie-breaker `id DESC`)
  - [x] Return DTO fields needed by UI (`type`, `quantity`, `createdAt`, `syncStatus`, identifiers)
  - [x] Enforce tenant isolation and membership checks on history reads; allow `Admin`, `Manager`, `Operator`

- [x] Build movement history UI with offline-first behavior (AC: 1, 3, 4)
  - [x] Create movement history list component with newest-first rendering and per-row movement metadata
  - [x] Merge local offline movements with server pages without duplicates and preserve deterministic ordering
  - [x] Add visible pending-sync indicators that do not rely on color alone
  - [x] Add empty state with explanatory copy and CTA to record stock movement

- [x] Implement infinite scroll UX and performance guardrails (AC: 2)
  - [x] Add auto-pagination trigger (`IntersectionObserver` sentinel) and loading states for page append
  - [x] Prevent duplicate page fetches and keep list interactions responsive on low-end mobile devices

- [x] Integrate sync lifecycle updates for history rows (AC: 3)
  - [x] Reflect local movement rows immediately after offline creation
  - [x] Transition row status (`pending` -> `processing` -> `synced`/`failed`) after sync attempts

- [x] Add comprehensive verification coverage (AC: 1, 2, 3, 4)
  - [x] Integration tests for tenant isolation, role access, ordering, and cursor pagination correctness
  - [x] E2E-style tests for offline visibility, pending badges, and post-sync status transitions

## Dev Notes

### Developer Context

Story 2.4 delivers product-level movement history with deterministic newest-first ordering, offline visibility, and infinite scroll. It extends the offline-first foundation from Stories 2.1-2.3, where stock movements are already created locally first, queued through outbox, and later synchronized to the server.

This story is not a greenfield implementation: movement creation, local Dexie storage, outbox lifecycle states (`pending`, `processing`, `synced`, `failed`), and server-side movement APIs already exist and must be reused rather than replaced. The primary implementation gap is history browsing UX and robust pagination semantics for large histories.

The existing backend history API currently returns newest-first records but has incomplete cursor behavior (`cursor` accepted but not applied), so Story 2.4 must close this gap to avoid duplicate pages, ordering drift, and degraded mobile performance.

Business value for this story is immediate operational traceability: users can validate what happened most recently without connectivity and still trust the chronology during sync transitions.

### Technical Requirements

- Keep the story scope focused on per-product movement history browsing and pagination; do not redesign movement creation flow from Story 2.3.
- Reuse existing `stockMovements.listByProduct` endpoint and extend it with real cursor semantics instead of creating duplicate endpoints.
- Enforce deterministic order across all sources with a stable sort key (`createdAt DESC`, then `id DESC`).
- Implement cursor pagination using the same ordering keys (composite cursor), otherwise infinite scroll will produce duplicate/missing rows.
- Include row metadata required by AC and UX: movement type, quantity, timestamp, and sync state (`pending`/`processing`/`synced`/`failed`).
- Keep offline-first behavior: local rows appear immediately without waiting for server sync; syncing updates status, not user intent.
- Add non-color-only status affordances (icon + text + color) for pending/failed rows.
- Add a clear empty state with a CTA to record a movement.
- Preserve list responsiveness on mobile (incremental page append + non-blocking loading states).
- Movement history interactions must be keyboard-operable end-to-end (open history, navigate rows/actions, trigger CTA) with no keyboard trap.
- Use `aria-live` for page-append feedback and sync-status transitions that change row state.
- Ensure status semantics are exposed accessibly (`aria-label` or equivalent text), not visual color alone.

### Architecture Compliance

- Keep tenant isolation strict on history reads: protected procedures + tenant context + membership check before returning movements.
- Maintain append-only ledger discipline for `stock_movements`; never implement history correction via update/delete operations.
- Keep routers thin and business logic in services (`inventory-service`), following existing server boundaries.
- Keep client/server boundaries strict: client code must not import from `src/server/**`.
- Keep API/JSON payloads camelCase; DB schema remains snake_case.
- Treat server as authoritative for conflict and ordering policy (LWW with server timestamps).
- Keep offline sync path aligned with outbox/idempotency conventions already in place (`operationId` and `Idempotency-Key` alignment).

### Library & Framework Requirements

- Use existing stack and versions in repo (`apps/web/package.json`): Next.js 15.5.7, React 19, tRPC 11, Drizzle ORM 0.44.x, Dexie 4.3.0, Better Auth 1.3.x, Zod 3.24.x.
- Prefer native `IntersectionObserver` for infinite scroll trigger; no additional list library is required for this story.
- Keep package manager as Bun and preserve repository conventions (`bun.lock` tracked).
- Do not perform framework/library upgrades in this story. Latest registry versions are informative only and must be evaluated in dedicated upgrade PRs.

### File Structure Requirements

Expected implementation footprint (reuse before creating new modules):

- `apps/web/src/server/api/routers/stock-movements.ts` (modify)
  - Extend `listByProduct` response contract for cursor pagination and movement DTO shape.
- `apps/web/src/server/services/inventory-service.ts` (modify)
  - Implement composite cursor filtering and stable ordering.
- `apps/web/src/features/offline/movement-operations.ts` (modify)
  - Provide tenant-safe local history reader and merge-ready row shape for UI.
- `apps/web/src/features/inventory/hooks/use-stock-movements.ts` (new)
  - Encapsulate server pages + local pending merge + infinite-scroll state.
- `apps/web/src/features/inventory/components/movement-history.tsx` (new)
  - Render rows newest-first, status badges, empty state, and loading append state.
- `apps/web/src/app/products/[id]/movements/page.tsx` (new)
  - Product-scoped history screen (path-param only; no query-param fallback).
- `apps/web/src/features/products/components/products-table.tsx` (modify)
  - Add direct navigation to movement history for each product (desktop).
- `apps/web/src/features/products/components/swipeable-product-card.tsx` (modify)
  - Add movement-history action in mobile quick actions.
- `apps/web/tests/integration/stock-movements.test.ts` (modify)
  - Add pagination/order/tenant-isolation read-path coverage.
- `apps/web/tests/e2e/inventory-movements.test.ts` (modify) or `apps/web/tests/e2e/inventory-movement-history.test.ts` (new)
  - Add offline history visibility + pending badge + infinite-scroll behaviors.

### Testing Requirements

- Integration tests (server):
  - `listByProduct` returns only tenant-owned rows.
  - RBAC access allows `Admin`, `Manager`, `Operator`.
  - Newest-first ordering is stable across pagination boundaries.
  - Composite cursor pagination does not skip/duplicate rows.
  - Ordering remains deterministic when multiple rows share the same `createdAt` (tie-break `id DESC`).
  - Cursor implementation uses composite ordering keys (`createdAt` + `id`), not id-only pagination.
- Offline/integration tests (client data layer):
  - Local history read respects tenant context and product scope.
  - Pending rows transition correctly after sync outcomes.
  - Merge of local + server rows is deduplicated and deterministic.
- E2E-style tests (UX):
  - Offline user can open history and see newly created local movement immediately.
  - Pending-sync row is visibly distinguishable and accessible.
  - Infinite scroll appends additional rows and remains responsive.
  - Repeated `IntersectionObserver` callbacks while a page request is in-flight do not trigger duplicate fetches.
  - Empty state appears with CTA when product has no movements.
- Accessibility checks:
  - Add automated a11y coverage (axe) for movement-history flow, including keyboard traversal, status semantics, and `aria-live` announcements.
- Regression gates:
  - `bun run --cwd apps/web typecheck`
  - `bun run --cwd apps/web test:run --maxWorkers=1`

### Previous Story Intelligence

From Story 2.3 implementation:

- Reuse transaction-based offline writes (`product` + `stockMovement` + `outbox`) to avoid partial local state.
- Reuse movement sync lifecycle helpers:
  - `markMovementSyncing`
  - `markMovementSynced`
  - `markMovementSyncFailed`
- Reuse periodic + online-event sync trigger pattern already implemented in `stock-movement-form`.
- Reuse sync-status summary component behavior for non-blocking sync feedback.
- Preserve idempotency propagation (`idempotencyKey` from outbox to server mutation).

Known carry-forward gap from Story 2.3 that Story 2.4 must fix:

- `inventoryService.getMovementsByProduct` currently accepts `cursor` but does not apply it; infinite scroll correctness depends on implementing this now.
- `markMovementSyncing` currently updates outbox state only; if Story 2.4 UI exposes a `processing` row state, update movement-row status handling explicitly before relying on that transition.

### Git Intelligence Summary

Recent commit patterns show:

- Inventory movement backend/service and integration tests were recently introduced (`stock-movements` router/service/tests).
- Movement schema and migration were added in dedicated commits before API-level work.
- Subsequent commits focused on non-movement product form/edit behavior and lockfile updates.

Implementation implication:

- Story 2.4 should build incrementally on the existing movement stack and avoid broad unrelated refactors.

### Latest Technical Information

Registry snapshot (informational, not upgrade mandate):

- `next`: latest `16.1.6` (repo currently `15.5.7`)
- `@tanstack/react-query`: latest `5.90.21` (repo currently `5.69.0`)
- `dexie`: latest `4.3.0` (repo currently `4.3.0`)
- `drizzle-orm`: latest `0.45.1` (repo currently `0.44.x`)
- `better-auth`: latest `1.4.18` (repo currently `1.3.x`)
- `@serwist/next`: latest `9.5.6` (not currently in app deps)

Guidance for this story:

- Keep current project versions during Story 2.4 implementation.
- If upgrade work is required, isolate it into a dedicated PR and validate auth flows, `/api/sync`, and Stripe webhook ingress per project rules.

### Project Context Reference

Mandatory project rules that apply directly to this story:

- Tenant-scoped data access must rely on tenant context/RLS helper; do not rely only on ad-hoc filters.
- `stock_movements` is append-only and must remain immutable as a ledger.
- Offline flows must continue to write locally first (Dexie + outbox) rather than direct server writes.
- Conflict arbitration is server-authoritative LWW; client clocks are not authoritative.
- API-visible datetimes must be ISO UTC strings; keep DTO shape consistent.
- Use structured logs and avoid secret/PII leakage.

### Story Completion Status

- Story document status set to `ready-for-dev`.
- Story includes architecture constraints, reuse guidance, explicit file targets, and test coverage expectations.
- Completion note recorded: `Ultimate context engine analysis completed - comprehensive developer guide created`.

### Project Structure Notes

- Proposed additions follow existing feature-first layout and server/client boundaries.
- No architecture-level structural conflict detected.
- Route strategy fixed for consistency: `/products/[id]/movements` across desktop and mobile entry points.

### References

- Story requirements and AC: [Source: _bmad-output/planning-artifacts/epics.md#Story-2.4-Movement-History-per-Product-Newest-First--Infinite-Scroll]
- Epic context and FR mapping: [Source: _bmad-output/planning-artifacts/epics.md#Epic-2-Offline-First-Inventory-Core-Products--Stock-Movements--Sync]
- Offline-first and append-only ledger constraints: [Source: _bmad-output/planning-artifacts/architecture.md#Core-Architecture]
- Conflict policy and idempotency conventions: [Source: _bmad-output/planning-artifacts/architecture.md#Data-Management]
- API and boundary requirements: [Source: _bmad-output/project-context.md#Framework-Specific-Rules-Nextjs--API-Boundaries]
- Critical tenancy/offline/idempotency rules: [Source: _bmad-output/project-context.md#Critical-Dont-Miss-Rules]
- Current app dependency baselines: [Source: apps/web/package.json]
- Existing stock movement router/service implementation baseline: [Source: apps/web/src/server/api/routers/stock-movements.ts], [Source: apps/web/src/server/services/inventory-service.ts]
- Existing offline movement operations baseline: [Source: apps/web/src/features/offline/movement-operations.ts]
- Existing sync status UX pattern: [Source: apps/web/src/features/products/components/sync-status-summary.tsx]
- Story 2.3 implementation learnings and prior file map: [Source: _bmad-output/implementation-artifacts/2-3-record-stock-entry-exit-offline-3-click-loop.md]
- UX guidance for status indicators, empty states, and accessibility: [Source: _bmad-output/planning-artifacts/ux-design-specification.md]

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- create-story workflow execution trace (interactive checkpoints + YOLO continuation)
- artifact analysis via parallel exploration subagents (story + architecture intelligence)
- local repository inspection (`stock-movements`, offline module, product list components)
- dependency version snapshot via registry queries

### Completion Notes List

- Story 2.4 created and enriched with implementation guardrails for offline history + infinite scroll.
- Added explicit anti-regression requirements around pagination correctness, tenant safety, and status visibility.
- Added concrete reuse guidance to prevent duplicate APIs/components and leverage Story 2.3 foundations.
- Added latest-technology snapshot with explicit instruction to avoid in-story upgrades.
- Ultimate context engine analysis completed - comprehensive developer guide created.
- ✅ Implemented composite cursor pagination using `createdAt DESC` + `id DESC` for deterministic ordering.
- ✅ Created `useStockMovements` hook that merges local offline movements with server pages.
- ✅ Built `MovementHistory` component with infinite scroll via `IntersectionObserver`.
- ✅ Added sync status badges (pending/processing/failed) with non-color-only affordances (icon + text).
- ✅ Added empty state with CTA to record stock movement.
- ✅ Added navigation links from products table (desktop) and swipeable card (mobile).
- ✅ All 264 tests pass including new pagination and offline visibility tests.
- ✅ Fixed empty-state and header CTA links to use `/inventory?productId=...` and added product preselection support in the movement form.
- ✅ Fixed infinite-scroll pagination flow to load next pages only on observer trigger (no auto-advance cursor chaining).
- ✅ Fixed history merge flow to prevent server rows from being overwritten by local-only polling updates.
- ✅ Implemented real movement sync transition to `processing` and exposed it in local movement status typing.
- ✅ Hardened local history reads with tenant + product filtering.
- ✅ Added focused UI and offline tests for CTA route, IntersectionObserver load trigger behavior, and processing lifecycle visibility.

### File List

- `apps/web/src/server/services/inventory-service.ts` (modified) - Implemented composite cursor pagination with stable ordering
- `apps/web/src/features/offline/database.ts` (modified) - Added `processing` to local movement sync status type
- `apps/web/src/features/offline/movement-operations.ts` (modified) - Added tenant-safe movement history reads and processing-state transition updates
- `apps/web/src/features/inventory/hooks/use-stock-movements.ts` (new) - Hook for merging local + server movements with infinite scroll
- `apps/web/src/features/inventory/components/movement-history.tsx` (new) - Movement history list component with offline-first behavior
- `apps/web/src/features/inventory/components/stock-movement-form.tsx` (modified) - Added product preselection from query params and processing status sync transition call
- `apps/web/src/app/products/[id]/movements/page.tsx` (new) - Movement history page
- `apps/web/src/features/products/components/products-table.tsx` (modified) - Added History button for desktop
- `apps/web/src/features/products/components/swipeable-product-card.tsx` (modified) - Added History action for mobile
- `apps/web/tests/integration/stock-movements.test.ts` (modified) - Added pagination and ordering tests
- `apps/web/tests/e2e/inventory-movements.test.ts` (modified) - Added offline visibility and sync lifecycle tests
- `apps/web/tests/ui/movement-history.test.tsx` (new) - Added UI coverage for empty-state CTA and IntersectionObserver behavior
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified) - Updated story status to done

### Senior Developer Review (AI)

- Reviewer: Sokoshy (AI)
- Date: 2026-02-18
- Outcome: Changes Requested → Fixed
- Summary:
  - Fixed all HIGH and MEDIUM review findings.
  - Re-ran verification (`typecheck` + targeted integration/e2e/UI tests) with passing results.

### Change Log

- 2026-02-18: Applied code-review fixes for pagination flow, local/server merge correctness, sync-status lifecycle, tenant-safe local reads, CTA routing, and added UI/offline regression tests.
