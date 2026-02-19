# Story 2.5: Auto-Sync Engine + Sync Status (Offline Queue + LWW Conflicts)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a tenant user,
I want my offline changes to sync automatically with clear status visibility,
so that I can work offline confidently without manual sync actions.

## Acceptance Criteria

1. **Given** I perform changes while offline (`create`/`edit`/`delete` product, record movements)
   **When** the device has no connection
   **Then** changes are stored locally and queued for sync
   **And** the app remains fully usable (no blocking)

2. **Given** connectivity returns
   **When** the app detects it
   **Then** the system automatically starts syncing queued changes
   **And** the UI shows sync status states at minimum: `syncing`, `upToDate`, `offline`, `error`

3. **Given** multiple queued items exist
   **When** auto-sync runs
   **Then** changes are sent idempotently (no duplicate movements on retries)
   **And** successful items are marked synced locally
   **And** failed items remain queued with retry behavior

4. **Given** a conflict occurs during sync
   **When** the server determines the authoritative result using last-modified-wins
   **Then** the client applies the server-authoritative result locally
   **And** the user sees minimal non-blocking feedback (for example: conflict resolved / data updated)

5. **Given** sync encounters a persistent error
   **When** retries fail
   **Then** the UI shows a clear non-blocking error state
   **And** the user can continue working offline with changes still queued

## Tasks / Subtasks

- [x] Implement a centralized client sync engine for all offline operations (AC: 1, 2, 3, 5)
  - [x] Create `apps/web/src/features/offline/sync/sync-engine.ts` to orchestrate queue processing with single-flight protection per tenant
  - [x] Trigger sync on reconnect (`online` event) and periodic background attempts while app is active
  - [x] Process both `product` and `stockMovement` outbox entities in deterministic order and keep retry metadata
  - [x] Persist and expose global sync state machine (`offline`, `syncing`, `upToDate`, `error`) for UI consumption

- [x] Implement `/api/sync` REST contract and server-side sync application service (AC: 2, 3, 4, 5)
  - [x] Create `apps/web/src/schemas/sync.ts` with request/response validation for batch sync payloads and per-item results
  - [x] Define minimum DTO contract in `sync.ts`: request `checkpoint?` + `operations[]` (`operationId`, `entityType`, `operationType`, `tenantId`, `payload`), response `{ checkpoint, results[] }` with per-item `operationId`, `status`, optional `code`, `message`, and authoritative `serverState` when applicable
  - [x] Define checkpoint semantics explicitly: monotonic server token; client updates local checkpoint only after successful local reconciliation for returned items
  - [x] Enforce idempotency header/payload alignment (`Idempotency-Key` equals `operationId`) and return stable per-item result codes for retries, duplicates, conflicts, and validation failures (minimum code set: `VALIDATION_ERROR`, `TENANT_MISMATCH`, `NOT_FOUND`, `CONFLICT_RESOLVED`, `RATE_LIMITED`)
  - [x] Create `apps/web/src/app/api/sync/route.ts` with auth guard, tenant context wiring, and stable error shape `{ code, message }`
  - [x] Apply stricter sync endpoint rate limiting via `apps/web/src/server/rate-limit.ts` and return HTTP 429 with `{ code, message }` on limit exceed
  - [x] Create `apps/web/src/server/services/sync-service.ts` to apply operations idempotently and return `{ checkpoint, results }`
  - [x] Ensure dedupe uses `operationId` semantics aligned with architecture idempotency rules and avoids duplicate movement inserts

- [x] Implement LWW reconciliation and local authoritative-state application (AC: 4)
  - [x] Reconcile Dexie local records from server result payloads when conflicts are resolved server-side
  - [x] Keep user feedback minimal and non-blocking (status text or toast), no blocking conflict UI flow

- [x] Unify sync status UX across inventory and product surfaces (AC: 2, 5)
  - [x] Extend `SyncStatusSummary` or add feature-level `sync-status-indicator` to render required states with icon + text (not color-only)
  - [x] Remove movement-form-only sync orchestration and consume centralized sync state/hook instead
  - [x] Keep `aria-live` announcements for sync state changes and failures

- [x] Harden retry behavior without blocking user work (AC: 3, 5)
  - [x] Keep failed items queued with incremented retry counters and backoff scheduling
  - [x] Prevent infinite rapid retry loops and keep app interaction responsive while failures persist

- [x] Add full test coverage and run verification gates (AC: 1, 2, 3, 4, 5)
  - [x] Unit tests for sync engine state transitions, retry/backoff, and dedupe behavior
  - [x] Integration tests for `/api/sync` response contract, tenant safety, and idempotent replay behavior
  - [x] E2E tests for offline queueing, auto-sync on reconnect, conflict resolution feedback, and persistent error non-blocking UX
  - [x] Run `bun run --cwd apps/web typecheck` and `bun run --cwd apps/web test:run --maxWorkers=1`

## Dev Notes

### Developer Context

Story 2.5 is the offline-core completion story for Epic 2: it turns existing local-first CRUD/movement flows into a tenant-safe, automatic sync system with explicit runtime status states and server-authoritative reconciliation.

This is not greenfield. The repository already has:

- Dexie local storage with `products`, `stockMovements`, and `outbox` tables (`apps/web/src/features/offline/database.ts`)
- Outbox helpers and lifecycle statuses (`pending`, `processing`, `completed`, `failed`) (`apps/web/src/features/offline/outbox.ts`)
- Offline movement persistence and lifecycle helpers (`markMovementSyncing`, `markMovementSynced`, `markMovementSyncFailed`) (`apps/web/src/features/offline/movement-operations.ts`)
- Product create/edit/delete offline queues (`apps/web/src/features/offline/product-operations.ts`)
- Non-blocking sync status UI summary currently based on pending/failed outbox counts (`apps/web/src/features/products/components/sync-status-summary.tsx`)

Current gap to close in this story:

- There is no centralized sync engine for all offline entities.
- There is no `/api/sync` route yet, even though architecture and project-context define it as the canonical offline sync contract.
- Movement sync is currently orchestrated inside `stock-movement-form.tsx`, which does not scale to whole-app sync needs.
- Sync status is currently count-based and does not expose the required state machine (`syncing`, `upToDate`, `offline`, `error`).

### Technical Requirements

- Keep offline-first discipline: all write intents remain local-first through Dexie + outbox; no direct server write path from offline flows.
- Implement automatic sync detection and execution when connectivity returns, plus periodic retries while online.
- Ensure idempotent replay safety across retries; no duplicate stock movements or duplicate product mutations on repeated sync attempts.
- Keep failed operations queued and retryable; do not drop failed queue items silently.
- Apply server-authoritative LWW conflict outcomes locally; client timestamps are not authoritative for arbitration.
- Keep sync feedback non-blocking and subtle; users must continue operations while queue syncs or fails.
- Keep tenant safety for every sync operation and payload item.

### Architecture Compliance

- Implement sync ingress as REST `POST /api/sync` route handler (not tRPC), returning success shape `{ checkpoint, results }` and error shape `{ code, message }`.
- Keep route handler thin: validate request -> resolve tenant/auth context -> call server service -> return DTO.
- Keep sync business logic in `apps/web/src/server/services/sync-service.ts`.
- Use RLS tenant context helpers (`withTenantContext` / `setTenantContext`) so tenant-scoped writes remain fail-safe.
- Maintain append-only ledger semantics for `stock_movements`; never update/delete historical movement rows as reconciliation.
- Preserve naming contracts: DB `snake_case`, API JSON `camelCase`, ISO UTC datetime strings for API-visible values.

### Library & Framework Requirements

- Keep current repository stack for this story:
  - Next.js `15.5.7`
  - `@tanstack/react-query` `5.69.0`
  - Dexie `4.3.0`
  - Drizzle ORM `0.44.x`
  - Better Auth `1.3.x` (maintain `>=1.2.10` requirement)
- Use Bun for scripts and dependency operations; keep `bun.lock` as lockfile source of truth.
- Do not perform framework/library upgrades inside Story 2.5.

### File Structure Requirements

Primary implementation footprint:

- `apps/web/src/features/offline/sync/sync-engine.ts` (new)
- `apps/web/src/features/offline/sync/use-sync-status.ts` (new, optional if needed for UI consumption)
- `apps/web/src/features/offline/outbox.ts` (modify for queue retrieval order, retry metadata helpers as needed)
- `apps/web/src/features/offline/product-operations.ts` (modify for centralized engine integration and reconciliation hooks)
- `apps/web/src/features/offline/movement-operations.ts` (modify for centralized engine integration and reconciliation hooks)
- `apps/web/src/features/products/components/sync-status-summary.tsx` (modify to required state model)
- `apps/web/src/features/inventory/components/stock-movement-form.tsx` (modify to consume centralized sync trigger/status)
- `apps/web/src/schemas/sync.ts` (new)
- `apps/web/src/app/api/sync/route.ts` (new)
- `apps/web/src/server/services/sync-service.ts` (new)
- `apps/web/tests/unit/offline/sync-engine.test.ts` (new)
- `apps/web/tests/integration/sync-route.test.ts` (new)
- `apps/web/tests/e2e/offline-auto-sync.test.ts` (new or extend existing e2e)

### Testing Requirements

- Unit coverage:
  - Sync state machine transitions: `offline -> syncing -> upToDate` and failure to `error`
  - Retry/backoff behavior and max-attempt handling
  - Idempotency handling in client payload assembly and response reconciliation
- Integration coverage:
  - `/api/sync` validates and enforces tenant membership/context
  - Response payload follows `{ checkpoint, results }` and per-item status semantics
  - Idempotent replay does not duplicate server movements
  - Replaying the same `operationId` does not increase `stock_movements` row count (DB invariant assertion)
  - `/api/sync` rejects tenant mismatch inside payload items even for authenticated users
  - Conflict/LWW path applies server-authoritative values in reconciliation payload
- E2E coverage:
  - Offline queue creation across product + movement actions
  - Auto-sync kicks in when browser returns online
  - Persistent error state remains non-blocking; user continues offline operations
  - Minimal conflict resolution feedback appears without blocking dialogs
- UI/a11y coverage:
  - Add automated accessibility checks for sync status indicator (`aria-live` announcements + icon/text semantics, not color-only)
- Verification gates:
  - `bun run --cwd apps/web typecheck`
  - `bun run --cwd apps/web test:run --maxWorkers=1`

### Previous Story Intelligence

From Story 2.4 and recent implementation history:

- Reuse existing movement sync lifecycle functions instead of creating parallel lifecycle paths.
- Reuse and extend `SyncStatusSummary` accessibility pattern (`role="status"`, `aria-live="polite"`).
- Preserve tenant filtering patterns introduced in offline movement readers.
- Avoid regressions in movement-history behavior (deterministic ordering, infinite-scroll correctness) while adding central sync orchestration.
- Keep stock-movement form focused on capture UX; move orchestration logic to reusable offline sync module.

### Git Intelligence Summary

Recent commits show a clear incremental pattern that Story 2.5 must continue:

- `f8733ed`: improved offline movement sync lifecycle and tenant filtering
- `42505b9`: added movement history page + infinite-scroll hook
- `874afd9`: added inventory preselection support
- `2418d70`: added history navigation on desktop/mobile
- `fd00e45`: finalized Story 2.4 artifacts and sprint status

Implementation implication: extend established offline and inventory patterns with focused sync-engine + API work; avoid broad unrelated refactors.

### Latest Technical Information

Registry snapshot reviewed for risk awareness:

- `next`: latest `16.1.6` (repo uses `15.5.7`)
- `@tanstack/react-query`: latest `5.90.21` (repo uses `5.69.0`)
- `dexie`: latest `4.3.0` (repo uses `4.3.0`)
- `drizzle-orm`: latest `0.45.1` (repo uses `0.44.0`)
- `better-auth`: latest `1.4.18` (repo uses `^1.3`)
- `@serwist/next`: latest `9.5.6`

Story decision: no dependency upgrades in this story; implement with current repo versions and Bun workflow.

### Project Context Reference

Mandatory rules applied to this story:

- Package manager is Bun; do not switch package managers.
- `/api/sync` is the offline sync contract and must keep stable response/error shapes.
- Tenant-scoped writes must run with RLS tenant context.
- Offline flows must write via outbox first; no direct server writes from offline UI flows.
- Idempotency requires aligned `operationId` and `Idempotency-Key`.
- LWW conflict arbitration is server-authoritative.
- `stock_movements` remains append-only.

### Story Completion Status

- Story status: `ready-for-dev`.
- Completion note: `Ultimate context engine analysis completed - comprehensive developer guide created`.

### Project Structure Notes

- Alignment is maintained with feature-first structure:
  - client offline logic in `src/features/offline/**`
  - REST sync route in `src/app/api/sync/route.ts`
  - server business logic in `src/server/services/**`
  - shared validation in `src/schemas/**`
- Existing variance to resolve in this story:
  - sync orchestration currently embedded in `stock-movement-form.tsx`; move to centralized offline sync module to avoid duplicated flow logic.
- Naming and contract consistency required:
  - files in `kebab-case`, JSON `camelCase`, DB `snake_case`, API datetime as ISO UTC strings.

### References

- Story 2.5 requirements and AC: [Source: _bmad-output/planning-artifacts/epics.md#Story-2.5-Auto-Sync-Engine--Sync-Status-Offline-Queue--LWW-Conflicts]
- Epic 2 scope and continuity: [Source: _bmad-output/planning-artifacts/epics.md#Epic-2-Offline-First-Inventory-Core-Products--Stock-Movements--Sync]
- Offline-first FRs and sync/conflict FRs: [Source: _bmad-output/planning-artifacts/prd.md#4-Offline-First-Architecture]
- Architecture sync contract, idempotency, and LWW: [Source: _bmad-output/planning-artifacts/architecture.md#API--Communication-Patterns], [Source: _bmad-output/planning-artifacts/architecture.md#Communication-Patterns-Offline-Sync], [Source: _bmad-output/planning-artifacts/architecture.md#Data-Architecture]
- Project critical rules (Bun, RLS, outbox-first, idempotency): [Source: _bmad-output/project-context.md#Technology-Stack--Versions], [Source: _bmad-output/project-context.md#Critical-Dont-Miss-Rules], [Source: _bmad-output/project-context.md#Framework-Specific-Rules-Nextjs--API-Boundaries]
- UX guidance for subtle sync indicators and invisible auto-sync: [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Phase-4-Completion-05-second], [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Phase-2-StockZen-Specific-Components-Week-3-4]
- Current offline/outbox implementation baseline: [Source: apps/web/src/features/offline/database.ts], [Source: apps/web/src/features/offline/outbox.ts], [Source: apps/web/src/features/offline/product-operations.ts], [Source: apps/web/src/features/offline/movement-operations.ts]
- Current sync-status UI baseline: [Source: apps/web/src/features/products/components/sync-status-summary.tsx], [Source: apps/web/src/features/inventory/components/stock-movement-form.tsx]
- Current movement API/service baseline and idempotency handling: [Source: apps/web/src/server/api/routers/stock-movements.ts], [Source: apps/web/src/server/services/inventory-service.ts], [Source: apps/web/drizzle/0011_keen_iceman.sql]
- Previous story context and learned patterns: [Source: _bmad-output/implementation-artifacts/2-4-movement-history-per-product-newest-first-infinite-scroll.md], [Source: _bmad-output/implementation-artifacts/2-3-record-stock-entry-exit-offline-3-click-loop.md]

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- create-story workflow execution log (interactive checkpoints with YOLO continuation)
- exhaustive artifact review: epics, PRD, architecture, UX, project-context, previous stories
- repository pattern scan: offline modules, inventory form sync loop, movement API/service, tests
- git intelligence review: last 5 commits and touched files
- dependency intelligence snapshot (latest registry versions vs pinned repository versions)

### Completion Notes List

- Story 2.5 context generated with explicit anti-regression and anti-reinvention guardrails.
- Sync architecture defined as centralized client engine + REST `/api/sync` + server service reconciliation.
- Bun workflow preserved; no in-story dependency upgrades approved.
- Ultimate context engine analysis completed - comprehensive developer guide created.
- ✅ Implemented centralized SyncEngine class with state machine (`offline`, `syncing`, `upToDate`, `error`)
- ✅ Created `/api/sync` REST endpoint with auth guard, tenant context, and rate limiting
- ✅ Implemented sync-service.ts with idempotent product and stockMovement operations
- ✅ Extended sync status UI with icon + text states (not color-only) and aria-live announcements
- ✅ Refactored stock-movement-form.tsx to consume centralized sync engine
- ✅ Added unit tests for sync engine state transitions, retry/backoff, dedupe behavior
- ✅ Added integration tests for /api/sync contract, tenant safety, idempotent replay
- ✅ Added E2E tests for offline queueing, auto-sync on reconnect, conflict resolution, persistent error UX
- ✅ Targeted sync tests pass (`24/24`) and typecheck passes
- ✅ Aligned idempotency contract: per-operation `idempotencyKey === operationId` with single-op header guard
- ✅ Wrapped `/api/sync` execution in tenant RLS context via `withTenantContext`
- ✅ Fixed product create identifier mapping to `entityId` and implemented stale-update `conflict_resolved` (LWW)
- ✅ Applied server-authoritative product state locally during success/conflict reconciliation
- ✅ Enforced checkpoint semantics by persisting server checkpoint after reconciliation
- ✅ Hardened retry behavior with exponential backoff scheduling and failed-attempt timestamps
- ✅ Fixed sync engine lifecycle leaks (online/offline listener cleanup) and multi-surface engine contention via acquire/release reference counting

### File List

- `apps/web/src/schemas/sync.ts` (created - sync request/response schemas)
- `apps/web/src/features/offline/sync/sync-engine.ts` (created - centralized sync engine)
- `apps/web/src/features/offline/sync/use-sync-status.ts` (created - React hook for sync state)
- `apps/web/src/features/offline/outbox.ts` (modified - failed-attempt timestamp persistence for retry scheduling)
- `apps/web/src/features/offline/product-operations.ts` (modified - server-authoritative local reconciliation helper)
- `apps/web/src/app/api/sync/route.ts` (created - REST sync endpoint)
- `apps/web/src/server/services/sync-service.ts` (created - server-side sync processing)
- `apps/web/src/features/products/components/sync-status-summary.tsx` (modified - new state model)
- `apps/web/src/features/inventory/components/stock-movement-form.tsx` (modified - uses sync engine)
- `apps/web/tests/unit/offline/sync/sync-engine.test.ts` (created - unit tests)
- `apps/web/tests/integration/sync-route.test.ts` (created - integration tests)
- `apps/web/tests/e2e/offline-auto-sync.test.ts` (created - E2E tests)
- `_bmad-output/implementation-artifacts/2-5-auto-sync-engine-sync-status-offline-queue-lww-conflicts.md` (updated - tasks completed)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (updated - status set to in-progress, then review)
