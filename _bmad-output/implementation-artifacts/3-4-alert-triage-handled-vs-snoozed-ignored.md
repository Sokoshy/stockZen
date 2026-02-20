# Story 3.4: Alert Triage (Handled vs Snoozed/Ignored)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a tenant user,
I want to mark alerts as handled or temporarily snoozed,
so that I can manage my work without losing critical stock visibility.

## Acceptance Criteria

1. **Given** I have an active alert for a product
   **When** I mark the alert as "handled"
   **Then** the alert is marked handled and removed from the active alerts list
   **And** the system can reopen/reactivate the alert if the product remains or becomes non-green again

2. **Given** I have an active alert for a product
   **When** I mark the alert as "ignored/snoozed"
   **Then** the alert is snoozed for 8 hours
   **And** it is hidden from the active alerts list during the snooze window

3. **Given** an alert is snoozed and the product alert level worsens (orange -> red)
   **When** the system updates the alert level
   **Then** the snooze is cancelled
   **And** the alert becomes visible again immediately as `red`

4. **Given** an alert is snoozed and 8 hours have passed
   **When** the product is still `orange` or `red`
   **Then** the alert becomes visible again (snooze expires)

5. **Given** an alert is snoozed and the product returns to `green`
   **When** stock becomes `> attentionThreshold`
   **Then** the active alert is closed automatically (per alert closure rules)

## Tasks / Subtasks

- [x] Extend persistent alert model for triage semantics without breaking one-active-alert invariant (AC: 1, 2, 3, 4, 5)
  - [x] Add migration for triage fields on `alerts` (handled marker and snooze window metadata)
  - [x] Keep active-alert uniqueness behavior intact for `(tenant_id, product_id)` when status is active
  - [x] Update Drizzle schema and Zod alert contracts (`apps/web/src/server/db/schema.ts`, `apps/web/src/schemas/alerts.ts`)

- [x] Implement triage lifecycle domain logic in server service layer (AC: 1, 2, 3, 4, 5)
  - [x] Add `markHandled` operation that removes alert from active list semantics
  - [x] Add `snoozeForEightHours` operation that hides alert until `now + 8h`
  - [x] Ensure snooze cancels on worsening transition (`orange -> red`)
  - [x] Ensure snooze expiry re-surfaces alerts when still non-green
  - [x] Preserve green-closure behavior and clear triage/snooze metadata when closed

- [x] Integrate triage logic into existing stock/sync alert recalculation paths (AC: 1, 3, 4, 5)
  - [x] Update `updateAlertLifecycle` in `alert-service` to handle triage state transitions atomically
  - [x] Keep online movement path (`inventory-service`) and `/api/sync` path (`sync-service`) behavior consistent
  - [x] Preserve idempotent replay guarantees and avoid duplicate/reactivation races

- [x] Expose alert triage via typed API contracts and router boundary (AC: 1, 2)
  - [x] Add/extend `alerts` tRPC router with: list active alerts, mark handled, snooze 8h
  - [x] Wire router in `apps/web/src/server/api/root.ts`
  - [x] Enforce tenant membership and role-safe access on all triage operations

- [x] Add UX affordances for triage actions without regressing existing product alert indicators (AC: 1, 2, 3, 4)
  - [x] Add handled/snooze action entrypoint in existing alert-visible UI surface
  - [x] Reflect immediate list updates after triage actions
  - [x] Keep R/O/G badges and accessibility semantics intact (color + text/icon)

- [x] Add comprehensive verification coverage and run quality gates (AC: 1, 2, 3, 4, 5)
  - [x] Unit tests for triage state machine (handled, snoozed, expiry, worsen-cancel)
  - [x] Integration tests for end-to-end lifecycle and one-active-alert invariant with triage
  - [x] Sync tests for idempotent replay and triage-aware recomputation paths
  - [x] UI tests for triage action visibility/update behavior
  - [x] Run `bun run --cwd apps/web typecheck` and `bun run --cwd apps/web test:run --maxWorkers=1`

## Dev Notes

### Developer Context

Story 3.4 introduces operational triage on top of Story 3.3's persistent alert lifecycle.

Current implementation baseline (from Story 3.3):
- Alert persistence exists with `alerts` table and one-active-alert-per-product invariant via partial unique index.
- Alert level lifecycle (`red`/`orange`/`green`) is centralized in `apps/web/src/server/services/alert-service.ts`.
- Lifecycle orchestration already runs in both online movement flow (`inventory-service`) and offline sync replay flow (`sync-service`).
- Product list payloads already expose alert metadata (`alertLevel`, `hasActiveAlert`, `activeAlertUpdatedAt`) and UI badges render R/O/G.

Story 3.4 must add triage behavior (`handled`, `snoozed 8h`) without regressing:
- level classification boundaries,
- one-active-alert invariant,
- sync idempotency,
- tenant/RLS isolation,
- and role-safe server enforcement.

### Technical Requirements

- Preserve classification rules from Story 3.3:
  - `red` if `stock <= criticalThreshold`
  - `orange` if `criticalThreshold < stock <= attentionThreshold`
  - `green` if `stock > attentionThreshold`
- Implement triage semantics:
  - For this story, `ignored` is treated as `snoozed` (same action and same 8-hour behavior).
  - `handled`: removed from active-alert list semantics.
  - `snoozed`: hidden for exactly 8 hours from server timestamp.
  - `orange -> red` worsening while snoozed cancels snooze immediately and re-surfaces as `red`.
  - after 8 hours, if still `orange`/`red`, alert reappears automatically.
  - if product returns `green` while snoozed, close alert per existing closure rules.
- Reactivation behavior:
  - handled/closed alerts must be reopenable/reactivable if product remains or becomes non-green again.
- Lifecycle and stock updates must remain transactionally consistent; avoid split-brain between product quantity and alert state.
- Use server-authoritative times for snooze windows and conflict decisions (never client clock arbitration).

Suggested persistence transition model (implementation guardrail):
- `active (visible)` + `snoozedUntil = null`
- `active (hidden-snoozed)` + `snoozedUntil > now`
- `handled/closed` via explicit handled marker and closed lifecycle fields
- reopen path when recalculation yields non-green after handled/closed

Suggested tRPC contract for triage endpoints:
- `alerts.listActive`: returns active alerts visible at `now` (excluding active-snoozed where `snoozedUntil > now`)
- `alerts.markHandled({ alertId })`: marks alert handled and removes from active list
- `alerts.snooze({ alertId })`: sets `snoozedUntil = now + 8h`
- Error model aligns with existing tRPC conventions (`FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`)

### Architecture Compliance

- Keep business logic in `apps/web/src/server/services/**`; routers remain thin (`validate -> service -> DTO`).
- Keep `/api/sync` contract stable: success `{ checkpoint, results }`, errors `{ code, message }`.
- Keep tenant isolation strict through RLS context setup (`withTenantContext`/`setTenantContext`) and tenant-scoped queries.
- Keep DB naming `snake_case`, API payload naming `camelCase`, and API-visible dates in ISO 8601 UTC strings.
- Do not import `src/server/**` in client-side code.
- Maintain structured JSON logging (`pino`) and avoid logging secrets/PII.
- Permission matrix for triage operations (server-authoritative):
  - `Admin`: allowed
  - `Manager`: allowed
  - `Operator`: allowed

### Library & Framework Requirements

- Use project-pinned stack for this story implementation:
  - Next.js `15.5.7`
  - tRPC `11.x` (`@trpc/server` pinned with `^11.0.0`)
  - Drizzle ORM `0.44.x`
  - Better Auth `^1.3` (keep security floor `>= 1.2.10`)
  - Zod `^3.24.2`
  - Dexie `^4.3.0`
  - pino `^10.3.0`
- Do not bundle framework/library upgrades with Story 3.4; keep change scope focused on triage correctness.

### File Structure Requirements

Expected touch points for Story 3.4:

- `apps/web/drizzle/0016_*.sql` (new triage/snooze schema migration)
- `apps/web/src/server/db/schema.ts` (alert model updates)
- `apps/web/src/schemas/alerts.ts` (triage-related contracts)
- `apps/web/src/server/services/alert-service.ts` (triage state machine + lifecycle integration)
- `apps/web/src/server/services/inventory-service.ts` (ensure lifecycle invocation remains triage-aware)
- `apps/web/src/server/services/sync-service.ts` (triage-aware lifecycle behavior under sync)
- `apps/web/src/server/api/routers/alerts.ts` (new/extended triage endpoints)
- `apps/web/src/server/api/root.ts` (router wiring)
- `apps/web/src/features/alerts/**` (if introducing dedicated alert list UI surface)
- `apps/web/src/features/products/components/*.tsx` (if triage actions are exposed in existing product alert surfaces)
- `apps/web/src/schemas/sync.ts` (only if triage operations must be queued via offline outbox)

### Testing Requirements

- Unit tests:
  - triage transitions (`handled`, `snoozed`, `expired`, `cancelled on worsen`),
  - reopen/reactivation semantics from handled to visible non-green alert,
  - green closure behavior while snoozed.
- Integration tests:
  - tenant-scoped triage mutations (no cross-tenant access),
  - one-active-alert invariant preserved with triage actions,
  - movement-driven lifecycle + triage interplay.
- Sync tests:
  - idempotent replay safety when triage-related lifecycle updates occur,
  - no duplicate active alerts after retries,
  - authoritative server state consistency.
- UI tests:
  - triage controls render only when relevant,
  - handled/snoozed actions update visible list state correctly,
  - R/O/G badge rendering remains correct after triage transitions.
- Quality gates:
  - `bun run --cwd apps/web typecheck`
  - `bun run --cwd apps/web test:run --maxWorkers=1`

### Previous Story Intelligence

From Story 3.3 implementation and completion record:
- Alert lifecycle is already centralized and should be extended, not duplicated.
- Upsert-based active alert handling removed previous race windows; preserve this pattern.
- Sync and online movement paths were intentionally aligned; Story 3.4 must keep one canonical lifecycle path.
- Existing product payload alert metadata is a stable UI contract; extend carefully to avoid breaking filters/badges.

### Git Intelligence Summary

Recent commit pattern indicates effective sequencing:
1. domain/contracts first,
2. service integration,
3. router exposure,
4. UI adaptation,
5. tests and artifact/status updates.

Apply the same cadence for Story 3.4 to reduce regression risk and keep reviewability high.

### Latest Tech Information

Registry snapshot (2026-02-20):
- `next`: `16.1.6` (project pinned `15.5.7`)
- `@trpc/server`: `11.10.0` (project pinned `^11.0.0`)
- `drizzle-orm`: `0.45.1` (project pinned `^0.44.0`)
- `better-auth`: `1.4.18` (project pinned `^1.3`)
- `zod`: `4.3.6` (project pinned `^3.24.2`)
- `dexie`: `4.3.0` (project aligned)
- `pino`: `10.3.1` (project pinned `^10.3.0`)

Guidance for this story:
- Keep pinned versions during implementation.
- If upgrades become necessary, isolate them in a dedicated PR and revalidate auth flows, sync behavior, and alert lifecycle.

### Project Context Reference

Mandatory guardrails from `project-context.md`:
- Bun package manager conventions remain authoritative.
- Shared schemas in `src/schemas/**`; avoid duplicated validation definitions.
- Server is authoritative for RBAC and tenancy boundaries.
- Never bypass tenant RLS context.
- Offline writes flow through outbox + `/api/sync` (no direct server writes from offline UI).
- Preserve idempotency semantics for sync operations.
- Keep structured logging with secret/PII redaction.

### Story Completion Status

- Story status: `done`
- Completion note: `Implementation and adversarial review fixes complete - all acceptance criteria satisfied`

### Project Structure Notes

- Alignment:
  - Existing service-first backend (`apps/web/src/server/services/**`) and tRPC router boundaries are suitable for triage implementation.
  - Existing alerts persistence and product alert metadata already provide a strong base for incremental extension.
- Detected variances:
  - Architecture target tree references `src/server/api/routers/alerts.ts` and `src/features/alerts/**`, but the current codebase has not yet introduced this router/feature module.
  - Current DB schema is centralized in `apps/web/src/server/db/schema.ts` (single file) rather than sharded schema files from the architecture sketch; follow current repo convention for consistency in this story.

### References

- Story 3.4 BDD acceptance criteria and Epic 3 context: [Source: _bmad-output/planning-artifacts/epics.md#Story-3.4-Alert-Triage-Handled-vs-SnoozedIgnored], [Source: _bmad-output/planning-artifacts/epics.md#Epic-3-Thresholds--Alerting-Actionable-Alerts]
- FR13 requirement baseline: [Source: _bmad-output/planning-artifacts/prd.md#Functional-Requirements]
- Architecture boundaries and sync/RLS rules: [Source: _bmad-output/planning-artifacts/architecture.md#Core-Architectural-Decisions], [Source: _bmad-output/planning-artifacts/architecture.md#Implementation-Patterns--Consistency-Rules], [Source: _bmad-output/planning-artifacts/architecture.md#Project-Structure--Boundaries]
- UX triage intent (alerts triaged by business urgency): [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Journey-3-Marc---Multi-Supplier-Command-Center]
- Project guardrails for AI implementation: [Source: _bmad-output/project-context.md#Critical-Don’t‑Miss-Rules], [Source: _bmad-output/project-context.md#Framework-Specific-Rules-Nextjs--API-Boundaries]
- Existing implementation baseline from Story 3.3: [Source: _bmad-output/implementation-artifacts/3-3-automatic-alert-generation-r-o-g-classification-one-active-alert-per-product.md]
- Current code touchpoints: [Source: apps/web/src/server/services/alert-service.ts], [Source: apps/web/src/server/services/inventory-service.ts], [Source: apps/web/src/server/services/sync-service.ts], [Source: apps/web/src/server/api/routers/products.ts], [Source: apps/web/src/schemas/alerts.ts], [Source: apps/web/src/server/db/schema.ts], [Source: apps/web/drizzle/0015_alerts_table.sql]

## Dev Agent Record

### Agent Model Used

opencode/glm-5-free

### Debug Log References

- create-story workflow execution for Story 3.4 (auto-selected from sprint backlog)
- exhaustive artifact analysis: epics, PRD, architecture, UX, project-context
- previous-story intelligence extraction from Story 3.3 implementation artifact
- git intelligence analysis from the 5 most recent commits
- latest dependency/version snapshot lookup for implementation risk awareness

### Completion Notes List

- Story context generated with explicit triage-state requirements (`handled`, `snoozed 8h`, worsen-cancel, expiry re-surface).
- Guardrails emphasize lifecycle consistency across online and sync paths to prevent drift.
- Architecture and project-context constraints were embedded to prevent tenant/RLS and contract regressions.
- Story is ready for development with clear implementation boundaries and verification gates.
- ✅ Implemented database migration for triage fields (handled_at, snoozed_until)
- ✅ Extended Drizzle schema and Zod contracts with triage semantics
- ✅ Implemented markHandled and snoozeForEightHours operations in alert-service
- ✅ Integrated snooze cancellation on orange->red worsening transition
- ✅ Added listActiveAlerts query excluding snoozed alerts
- ✅ Created alerts tRPC router with listActive, markHandled, snooze endpoints
- ✅ Added ActiveAlertsList component to dashboard with triage action buttons
- ✅ All 14 integration tests passing for triage state machine
- ✅ TypeScript typecheck passing
- ✅ Added pure utility functions (isAlertSnoozed, calculateSnoozeExpiry, shouldCancelSnoozeOnWorsening)
- ✅ 22 unit tests for triage logic (visibility, expiry, worsening conditions)
- ✅ Review fix: protected alert creation against concurrent unique-active conflicts (insert fallback update)
- ✅ Review fix: hardened markHandled/snooze mutations with tenant+active guards and BAD_REQUEST semantics for non-active alerts
- ✅ Review fix: enforced deterministic active alert ordering by severity (red before orange) then recency
- ✅ Review fix: added dedicated UI tests for triage actions and post-action list invalidation behavior
- ✅ Review fix: expanded integration tests for BAD_REQUEST behavior and priority ordering
- ✅ Quality gates re-run after review fixes: typecheck passing; focused triage tests passing (20/20); full test suite passing (`bun run --cwd apps/web test:run --maxWorkers=1 --silent`)

### File List

- `apps/web/drizzle/0016_alert_triage_fields.sql`
- `apps/web/drizzle/meta/_journal.json`
- `apps/web/src/server/db/schema.ts`
- `apps/web/src/schemas/alerts.ts`
- `apps/web/src/server/services/alert-service.ts`
- `apps/web/src/server/api/routers/alerts.ts`
- `apps/web/src/server/api/root.ts`
- `apps/web/src/features/alerts/components/active-alerts-list.tsx`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/tests/unit/alerts/alert-triage.test.ts`
- `apps/web/tests/integration/alert-triage.test.ts`
- `apps/web/tests/ui/active-alerts-list.test.tsx`
- `apps/web/tests/helpers/database.ts`
- `_bmad-output/implementation-artifacts/3-4-alert-triage-handled-vs-snoozed-ignored.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
