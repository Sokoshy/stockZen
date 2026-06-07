# ADR-0001: permanently_failed lifecycle and one-shot retry

- Status: Accepted
- Date: 2026-06-07
- Scope: `apps/web/src/features/offline`
- Authors: PR #15 (sync-pipeline-consolidation)

## Context

The offline sync pipeline writes every local mutation to a Dexie outbox
(`apps/web/src/features/offline/database.ts`) and drains it through a
`SyncEngine` that POSTs batches to `/api/sync`. The engine has always
classified the outcome of an attempt as one of `pending`, `processing`,
`completed`, `failed`, or `permanently_failed`. The first four are well
understood; `permanently_failed` was the edge case that the rest of
this ADR is about.

Until PR #15 the terminal state was a dead end:

1. An op reached `permanently_failed` when `retryCount + 1 >= maxRetries`
   and the server returned a non-retryable error
   (`validation_error`, `tenant_mismatch`, `not_found`).
2. The UI showed a red dot in `SyncStatusIndicator` and a non-zero
   `failedCount` in the engine state, but offered no way to recover
   the op or the local entity.
3. The only ways to clear the state were: clear IndexedDB (data loss),
   or hand-write a Dexie delete from devtools (inadmissible in prod).
4. Local entities were stranded: a `create` that never reached the
   server left a row the user could keep editing forever, and a
   `delete` that never reached the server could not be un-done because
   `restoreProduct` ignored tenantId and would have been a cross-tenant
   foot-gun if the dialog had called it on the wrong row.

We also discovered a second, more dangerous class of bug: the engine
was reverting **every** row in `processing` status when a sync failed
(including rows claimed by another tab), and `markOperationCompleted`
was doing the read+write across two separate Dexie calls with no
transaction, so a concurrent reader could observe the old `status`
but the new `payload.serverId`. Both were addressed in PR #15.

## Decision

### 1. New terminal-state transitions

`permanently_failed` is no longer a dead end. The user gets **exactly
one** more chance to retry, with a clear promise about what happens to
the local entity regardless of outcome:

| Action | Server outcome | Outbox row | Local entity | UI |
|---|---|---|---|---|
| Retry | 200 / success | `status = completed` | Preserved | `Synced` banner |
| Retry | 4xx (validation etc.) | **DELETED** | Cleaned up by `cleanupLocalEntityForOp` | `Operation abandoned, local entity removed` banner |
| Retry | network/abort | unchanged, `oneShotRetry` cleared by next claim | unchanged | `Retry did not succeed, try again later.` banner |
| Dismiss | n/a | **DELETED** | Cleaned up by `cleanupLocalEntityForOp` | `Operation abandoned, local entity removed` banner |

The one-shot retry is encoded as a transient boolean column
`oneShotRetry?: boolean` on `OutboxOperation`. The engine
(`SyncEngine.handlePermanentFailure` in `sync-pipeline.ts`) checks it
before falling through to the regular `markOperationFailed` terminal
mark — if set, the engine treats the failure as abandonment instead
and calls `cleanupLocalEntityForOp` + `db.outbox.delete(op.id)` inside
a single Dexie transaction.

### 2. Local-entity cleanup rules

`cleanupLocalEntityForOp(op)` runs in the same Dexie transaction as
the outbox row deletion. The rules are:

- **product create**: hard-delete the local product (it never existed
  on the server, so the user is back to a consistent state).
- **product update**: revert to the `originalProduct` snapshot stored
  in the op payload. If the snapshot is missing, hard-delete as a safe
  fallback.
- **product delete**: clear the local `deletedAt` so the product
  reappears as live, and set `syncStatus: synced` (the server never
  confirmed the delete).
- **stockMovement create**: hard-delete the local movement row, then
  recompute the product quantity by replaying only `synced` movements.

The function is best-effort: it never throws, errors are swallowed,
and the outbox row deletion still happens regardless. This avoids
locking the user's outbox behind a flaky per-op-type cleanup.

### 3. The `oneShotRetry` flag is transient

`retryPermanentlyFailedOperation(opId)` sets `oneShotRetry: true` on
the outbox row, then triggers a sync. The engine consumes the flag on
the next claim. `markOperationCompleted` explicitly clears it
(`oneShotRetry: undefined` in the Dexie update) so a successful retry
does not leave the flag dangling for a future attempt. A failed retry
on a `oneShotRetry` op is treated as abandonment — there is no
"second" user-driven retry on the same op; the user has to dismiss
and re-enter the change.

### 4. UI: collapsible list with per-row controls

`PermanentlyFailedList` (`components/permanently-failed-list.tsx`) is
the only place a user can see and act on `permanently_failed` ops. It
is wired to `useSyncStatus` and renders nothing when the count is
zero. Each row exposes a Retry and a Dismiss button. Both buttons
disable themselves while their op is in-flight (`inflight` Set in
component state) to prevent double-clicks. A status banner is shown
above the list with the outcome of the last action — explicitly
English copy, no i18n for now (consistency with the rest of the
admin app).

### 5. Engine correctness fixes bundled with this ADR

- `markOperationCompleted` now wraps the read+update in
  `db.transaction("rw", db.outbox, ...)`. The branch that sets
  `payload.serverId` performs one read + one write; the branch that
  doesn't performs a single write with no read.
- `markOperationFailed` now requires `maxRetries` at compile time.
  Passing it as a parameter that the caller silently dropped was
  exactly the regression that produced "infinite failed-but-never-
  permanently-failed" rows.
- `restoreProduct(productId, tenantId?)` now takes an optional
  tenantId and refuses to restore a row belonging to a different
  tenant when it is provided. The Delete dialog passes the current
  tenantId unconditionally, which makes the Undo action safe.
- `markOperationsForRetry` only reverts ops claimed this turn
  (the param `claimedThisTurn`). The previous implementation scanned
  every `processing` row globally, which let an aborted sync in tab A
  clobber a perfectly valid in-flight sync started by tab B.
- `getFailedCount` now includes both `failed` and `permanently_failed`,
  matching the UI's expectation that the red dot reflects any op the
  user has not been able to drain.

### 6. Dexie v6 migration

A new schema version (6) promotes `tenantId` to a first-class column
on the outbox and adds the `[tenantId+status]` composite index. The
upgrade callback backfills `tenantId` from `payload.tenantId` for
legacy rows so that the new indexed queries can find them. This
powers `getPermanentlyFailedOperations` and `getFailedCount` to
return in O(matches) instead of O(table).

## Consequences

Positive:

- The user can always recover from a `permanently_failed` op without
  losing the rest of the local state.
- Local state and server state are guaranteed to converge after a
  retry-or-dismiss: cleanup runs in the same transaction as the
  outbox deletion, so we never see "outbox row gone, local product
  still there" or vice-versa.
- `failedCount` and `permanentlyFailedCount` are now consistent: the
  indicator shows the truth, the list shows the rows.
- The engine no longer races on the read+update of
  `markOperationCompleted`, and no longer clobbers in-flight work
  from other tabs.

Negative / trade-offs:

- A user-driven retry on a non-retryable error is the only path that
  can leak data: if the server returned `validation_error` because
  the user's input is genuinely bad, the op is deleted and the user
  has to start over. The alternative (leaving the op in
  `permanently_failed` forever) is worse.
- `oneShotRetry` adds one extra column to the outbox. It is
  intentionally boolean (and not a counter) so the engine can treat
  the *next* attempt as the last.
- Best-effort cleanup means there are edge cases (e.g. an outbox
  payload missing `originalProduct` on an `update` op) where we
  hard-delete instead of revert. The fallback is documented inline.

## Alternatives considered

- **Keep `permanently_failed` as a true dead end with a "Reset" button
  in the UI.** Rejected: it doesn't address the "user's local entity
  is stranded" problem, and a Reset button that just deletes the
  outbox row would still leave the local entity in a bad state.
- **Auto-retry forever on `permanently_failed`.** Rejected: hides
  real validation errors and is a footgun in production.
- **Add a "force-dismiss" admin role that bypasses the local entity
  cleanup.** Rejected: out of scope for this PR, and we don't have
  an admin role today.
- **Move `permanently_failed` ops to a separate `dead_letter_queue`
  table.** Rejected: doubles the surface area for the same problem
  and complicates the engine.

## References

- `apps/web/src/features/offline/sync-pipeline.ts`
  - `retryPermanentlyFailedOperation`
  - `dismissPermanentlyFailedOperation`
  - `cleanupLocalEntityForOp`
  - `markOperationCompleted` (transaction-wrapped)
  - `markOperationFailed` (maxRetries required)
  - `restoreProduct` (tenantId guard)
  - `markOperationsForRetry` (claimedThisTurn only)
  - `getFailedCount` (includes permanently_failed)
  - `SyncEngine.handlePermanentFailure` (oneShotRetry branch)
- `apps/web/src/features/offline/database.ts`
  - `OutboxOperation.oneShotRetry`
  - Dexie v6 migration (tenantId backfill, [tenantId+status] index)
- `apps/web/src/features/offline/sync/use-sync-status.ts`
  - new exports: `permanentlyFailedCount`, `permanentlyFailedOps`,
    `retryFailed`, `dismissFailed`, `refreshPermanentlyFailed`
- `apps/web/src/features/offline/components/permanently-failed-list.tsx`
- `apps/web/src/features/products/components/delete-product-dialog.tsx`
  - calls `restoreProduct(id, tenantId)` for safe Undo
- `apps/web/tests/unit/offline/sync-pipeline/` — 12 unit tests for
  the new flow (5 production-fix tests + 7 one-shot-retry tests)
