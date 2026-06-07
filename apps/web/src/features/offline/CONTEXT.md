# Offline Sync — Context

This file describes the offline-first sync layer used by the StockZen
admin app. It is the entry point for an AI or a human who needs to
navigate the feature without re-deriving the domain from the code.

## Vocabulary

- **Outbox** — a Dexie table (`apps/web/src/features/offline/database.ts`)
  where every local mutation is recorded before it is sent to the
  server. The outbox is the source of truth for "what we still owe
  the server". A row in the outbox is an `OutboxOperation`.
- **OutboxOperation** — a single mutation: `operationType` (create /
  update / delete), `entityType` (product / stockMovement), `entityId`,
  `payload` (the data the server needs), `status`, `retryCount`, and
  `tenantId` (post-v6 schema).
- **Outbox status** — one of `pending`, `processing`, `completed`,
  `failed`, `permanently_failed`. The lifecycle is described in
  `docs/adr/0001-offline-sync-permanently-failed-lifecycle.md`.
- **Permanently failed** — terminal status reached when a non-
  retryable error (validation, tenant mismatch, not found) is returned
  and the retry budget is exhausted. The user has exactly one
  user-driven retry left; on a second failure the row is deleted and
  the local entity is cleaned up.
- **One-shot retry** — a transient `oneShotRetry: true` flag on the
  outbox row, set by `retryPermanentlyFailedOperation` and consumed
  by the engine on the next claim. A successful retry clears it; a
  failed retry triggers `cleanupLocalEntityForOp` + outbox delete
  instead of leaving the op stuck.
- **Local entity** — the Dexie row for a product or stock movement
  that the user has edited offline. The local entity is the source
  of truth for "what the user sees in the UI right now".
- **Server state** — the row on the Postgres server. The server is
  authoritative; the goal of the sync layer is to make the local
  state converge to the server state without losing user work.
- **SyncEngine** — the singleton per tenant that runs the drain loop,
  manages online/offline transitions, and emits state changes to
  React via `useSyncStatus`.
- **claimPendingOperations** — atomic Dexie transaction that flips
  ops from `pending`/`failed` to `processing` for the current sync
  turn. Multi-tab safe because the entire flip is one transaction.
- **Tenant** — every outbox row and local entity is scoped to a
  `tenantId`. Cross-tenant reads are not possible from inside the
  client; the engine filters by tenantId at every query.

## Lifecycle of an outbox row

```
                enqueueOperation
                       │
                       ▼
                  ┌─────────┐
                  │ pending │ ◄─────────────────┐
                  └─────────┘                   │
                       │                        │
              claimPendingOperations           │
                       │                        │
                       ▼                        │
                ┌────────────┐                  │
                │ processing │                  │
                └────────────┘                  │
                  │      │                      │
       success    │      │  permanent failure   │
       duplicate  │      │  (validation_error,  │
       conflict   │      │   tenant_mismatch,   │
                  │      │   not_found)         │
                  ▼      ▼                      │
            ┌──────────┐  ┌────────────────────┴────┐
            │completed │  │   retryCount + 1 < max  │──► failed ──┐
            └──────────┘  │                         │             │
                          │  retryCount + 1 >= max │             │
                          └────────────┬────────────┘             │
                                       │                          │
                                       ▼                          │
                              ┌─────────────────────┐             │
                              │ permanently_failed  │◄────────────┘
                              └─────────────────────┘
                                  │             │
                       user clicks │             │ user clicks
                       Retry       │             │ Dismiss
                                  ▼             ▼
                       ┌──────────────┐  ┌────────────────────┐
                       │ pending +    │  │ outbox DELETE +    │
                       │ oneShotRetry │  │ cleanupLocalEntity │
                       │ = true       │  │ ForOp              │
                       └──────┬───────┘  └────────────────────┘
                              │
                       engine.sync()
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────────┐  ┌──────────────┐
        │completed │   │  failure +   │  │  failure +   │
        │  (flag   │   │  oneShotRetry│  │  no flag     │
        │  cleared)│   │  = true      │  │  set         │
        └──────────┘   │  → abandon:  │  │  → noop or   │
                       │  cleanup +   │  │  failed      │
                       │  outbox      │  │              │
                       │  delete      │  └──────────────┘
                       └──────────────┘
```

## Module map

```
apps/web/src/features/offline/
├── database.ts                  ← Dexie schema (v6), outbox + products + stockMovements
├── sync-pipeline.ts             ← All outbox + local-entity operations
│   ├── enqueueOperation         — write a new outbox row
│   ├── claimPendingOperations   — atomic pending → processing
│   ├── markOperationCompleted   — tx-wrapped, optional serverId
│   ├── markOperationFailed      — maxRetries REQUIRED
│   ├── restoreProduct           — tx-wrapped, optional tenantId guard
│   ├── cleanupLocalEntityForOp  — best-effort per-op-type cleanup
│   ├── retryPermanentlyFailedOperation — flips to pending + oneShotRetry
│   ├── dismissPermanentlyFailedOperation — deletes + cleanup
│   ├── getPermanentlyFailedOperations   — indexed [tenantId+status]
│   ├── getPendingOperations              — pending OR failed
│   └── SyncEngine class                  — the drain loop
├── sync/
│   └── use-sync-status.ts        ← React hook: state + retry/dismiss actions
├── components/
│   └── permanently-failed-list.tsx ← UI: collapsible list with per-row actions
├── docs/adr/0001-…md             ← the ADR you are reading
└── tests/unit/offline/sync-pipeline/
    ├── claim-pending-operations.test.ts
    ├── mark-operation-completed.test.ts
    ├── mark-operation-failed.test.ts
    ├── restore-product.test.ts
    ├── retry-backoff.test.ts
    └── retry-permanently-failed.test.ts
```

## React surface

Consumers should not import from `sync-pipeline.ts` directly except for
type-level concerns (`OutboxOperation`, `RetryOutcome`). For
runtime use, go through `useSyncStatus` in
`sync/use-sync-status.ts`. It exposes:

- **State** — `state`, `pendingCount`, `failedCount`,
  `permanentlyFailedCount`, `permanentlyFailedOps`, `lastSyncAt`,
  `lastError`, `isSyncing`, `isOffline`, `hasError`, `isUpToDate`,
  `statusText`, `statusIcon`.
- **Actions** — `sync()`, `retryFailed(opId)`,
  `dismissFailed(opId)`, `refreshPermanentlyFailed()`.

The list UI is `<PermanentlyFailedList tenantId={…} />` from
`components/permanently-failed-list.tsx`. It is rendered as part of
`SyncStatusSummary` in
`apps/web/src/features/products/components/sync-status-summary.tsx`,
which is the only place the offline-sync UI surfaces in the admin
app today.

## Server contract

The drain loop POSTs to `/api/sync` with a `SyncRequest` shape
(`apps/web/src/schemas/sync.ts`):

```ts
type SyncRequest = {
  checkpoint: string | undefined;  // lastSyncAt from the previous turn
  operations: Array<{
    operationId: string;
    idempotencyKey: string;
    entityId: string;
    entityType: "product" | "stockMovement";
    operationType: "create" | "update" | "delete";
    tenantId: string;
    payload: Record<string, unknown>;
  }>;
};
```

The server returns a `SyncResponse` with per-operation results
classified as one of `success`, `duplicate`, `conflict_resolved`,
`validation_error`, `tenant_mismatch`, `not_found`, `rate_limited`.
The client treats `validation_error`, `tenant_mismatch`, `not_found`
as terminal (no further retry); `rate_limited` is retryable.

For single-op POSTs, the engine also sets an `Idempotency-Key`
header equal to the `operationId` so the server can dedup at the
HTTP layer as well.

## Constraints and invariants

- The outbox row's `tenantId` is the source of truth for tenant
  isolation. Pre-v6 rows fall back to `payload.tenantId` and are
  backfilled on the v6 upgrade.
- The engine never deletes an outbox row except via
  `cleanupLocalEntityForOp` (one-shot retry failure) or
  `dismissPermanentlyFailedOperation` (user action). All other
  status transitions preserve the row for audit.
- `claimPendingOperations` is the only place that flips
  `pending`/`failed` → `processing`. The flip is inside a single
  Dexie transaction; concurrent claims from another tab will see the
  rows already in `processing` and skip them.
- `markOperationsForRetry` only reverts ops claimed **this turn**,
  never ops claimed by another tab. This is what makes multi-tab
  safe.
- `markOperationCompleted` always clears `oneShotRetry: undefined` so
  a successful retry does not leave the flag around.
- `restoreProduct(id)` without a tenantId argument is permitted for
  legacy callers; with a tenantId it refuses to restore a row that
  belongs to a different tenant.

## Common tasks

### "I added a new mutation type. How do I sync it?"

1. Add the new entity type to the Dexie schema (bump the version,
   add the table).
2. Add the new operation types to `EnqueueOperationInput`.
3. In `createProductOffline` / `updateProductOffline` /
   `deleteProductOffline` (or their movement equivalents), call
   `enqueueOperation` with the right `operationType` and
   `entityType`.
4. In `SyncEngine.processSyncResults`, add a branch for the new
   entity type in `handleSuccess` and `handlePermanentFailure`.
5. In `cleanupLocalEntityForOp`, add a branch for the new
   entity/op type with explicit cleanup semantics.
6. Write unit tests for: enqueue, claim, success, terminal failure,
   and cleanup. The existing `tests/unit/offline/sync-pipeline/`
   directory has the pattern.

### "I need to surface another op status in the UI."

1. Add the status to the `OutboxOperation.status` union in
   `database.ts`.
2. Add a CSS / copy branch in `PermanentlyFailedList` for it (and
   in `SyncStatusIndicator` if it changes the indicator color).
3. Decide whether the engine should transition into it; if yes,
   update `markOperationFailed` and `handlePermanentFailure`.

### "I want to add a second user-driven retry."

Don't. The one-shot retry is a deliberate constraint: each
`permanently_failed` row has exactly one user-driven retry. If a
second attempt fails, the user has to dismiss the op and re-enter
the change. The rationale is in the ADR.

## Open questions

- Should `oneShotRetry` be a counter instead of a boolean? Currently
  no — the engine treats the next claim as the last regardless of
  how many times the user clicked Retry (in practice the UI prevents
  that with the in-flight disable).
- Should we surface the "Operation abandoned" banner with a
  "Re-create" button that re-enqueues the same op? Out of scope for
  this PR; the user can re-enter the change manually.
