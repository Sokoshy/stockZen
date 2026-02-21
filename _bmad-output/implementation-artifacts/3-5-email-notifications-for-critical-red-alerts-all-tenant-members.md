# Story 3.5: Email Notifications for Critical (Red) Alerts (All Tenant Members)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a tenant user,
I want email notifications to be sent when an alert becomes critical (red),
so that the whole team is aware of urgent stock risks.

## Acceptance Criteria

1. **Given** a product alert level changes to `red`
   **When** the system updates the active alert
   **Then** the system sends an email notification to all active members of the tenant
   **And** the email includes at minimum: product name, current stock, alert level (`red`), and a link to open the product/alert in the app

2. **Given** an active alert for a product remains `red` and is updated multiple times
   **When** stock changes but stays `red`
   **Then** the system does not spam duplicate emails for the same “became red” event
   **And** a new email is sent only if the alert goes back to non-red and later becomes `red` again

3. **Given** email delivery fails temporarily
   **When** sending fails
   **Then** the system retries according to a defined retry policy
   **And** failures are logged for debugging/monitoring without exposing sensitive data

4. **Given** a user is removed from the tenant
   **When** a future critical alert occurs
   **Then** that user does not receive notifications

## Tasks / Subtasks

- [x] Extend alert lifecycle logic to trigger critical-email notifications only on non-red -> red transitions (AC: 1, 2)
  - [x] Add explicit transition detection in `updateAlertLifecycle` for create/update/reopen paths
  - [x] Preserve existing one-active-alert-per-product behavior and triage semantics (`handled`, `snoozed`)
  - [x] Ensure no notification is sent when an alert remains `red` across stock updates

- [x] Implement tenant-wide recipient resolution for active members only (AC: 1, 4)
  - [x] Resolve recipients from current `tenant_memberships` + `user` records at send time
  - [x] Include `Admin`, `Manager`, and `Operator` members in the recipient set
  - [x] Ensure removed users are excluded automatically by membership deletion

- [x] Add critical-alert email transport and payload composition with resilient retries (AC: 1, 3)
  - [x] Build notification payload including product name, current stock, `red` level, and a deep link into the app
  - [x] Use server-authoritative URL construction from configured base URL
  - [x] Reuse established timeout/retry behavior and structured delivery logs (sent/skipped/failed)

- [x] Keep online and offline-sync alert paths behaviorally identical (AC: 1, 2, 3)
  - [x] Ensure movement flow (`inventory-service`) and sync replay flow (`sync-service`) both call the same notification-aware lifecycle
  - [x] Preserve idempotent sync replay semantics (no duplicate email from duplicate operation replay)

- [x] Add regression-safe automated coverage and run quality gates (AC: 1, 2, 3, 4)
  - [x] Unit tests for transition detection and anti-spam logic
  - [x] Integration tests for recipient scoping, removed-member exclusion, and red re-entry behavior
  - [x] Email utility tests for retry behavior and payload correctness
  - [x] Run `bun run --cwd apps/web typecheck` and `bun run --cwd apps/web test:run --maxWorkers=1`

## Dev Notes

### Developer Context

Story 3.5 extends Epic 3 alerting by adding operational email notifications for critical stock states (`red`) to all active tenant members.

Current baseline from completed Stories 3.3 and 3.4:
- Alert lifecycle is centralized in `apps/web/src/server/services/alert-service.ts`.
- Classification rules are already stable (`red`/`orange`/`green`) and used by both online inventory updates and offline sync replay.
- One-active-alert-per-product invariant is enforced by DB unique partial index.
- Triage behavior (`handled`, `snoozed`, worsen-cancel, expiry visibility) is implemented and tested.

Story 3.5 must add notification behavior without regressing:
- alert lifecycle correctness,
- tenant isolation and RBAC boundaries,
- sync idempotency,
- and existing dashboard/triage functionality.

### Technical Requirements

- Preserve the effective-threshold classification model:
  - `red` if `stock <= criticalThreshold`
  - `orange` if `criticalThreshold < stock <= attentionThreshold`
  - `green` if `stock > attentionThreshold`
- Notification trigger rule:
  - Send critical email only when alert state transitions from non-red (`green`/`orange`/no active alert) to `red`.
  - Do not send email on `red -> red` updates.
  - Send again only after alert leaves `red` and re-enters `red` later.
- Membership rule:
  - Recipients must be resolved from active tenant memberships at send time.
  - Removed members must not receive future emails.
- Delivery reliability rule:
  - Apply defined retry policy for temporary failures.
  - Log failures with structured metadata and no secrets/PII leakage.
- Integration rule:
  - Keep a single canonical lifecycle path; both online and `/api/sync` flows must produce identical notification behavior.
- Time and authority rule:
  - Server state and server time remain authoritative for transitions and dedupe decisions.

### Architecture Compliance

- Keep business logic in `apps/web/src/server/services/**`; routers/handlers remain thin (`validate -> service -> DTO`).
- Keep API boundaries stable:
  - tRPC for internal app APIs,
  - REST `/api/sync` contract remains `{ checkpoint, results }` and error `{ code, message }`.
- Keep tenant-safe DB access:
  - Use tenant-scoped queries under established RLS context setup,
  - never bypass tenancy safeguards.
- Maintain naming/format standards:
  - DB `snake_case`, API `camelCase`, API-visible dates ISO 8601 UTC.
- Keep observability hygiene:
  - structured JSON logs via pino,
  - redact sensitive fields,
  - avoid logging raw sensitive payloads or secret-bearing headers.

### Library & Framework Requirements

- Use project-pinned stack for implementation scope:
  - Next.js `15.5.7`
  - tRPC `11.x` (`@trpc/server` pinned `^11.0.0`)
  - Drizzle ORM `0.44.x`
  - Better Auth `^1.3` (security floor `>= 1.2.10`)
  - Zod `^3.24.2`
  - Dexie `^4.3.0`
  - pino `^10.3.0`
- Do not bundle dependency major upgrades in Story 3.5; keep feature scope focused on notification correctness.

### File Structure Requirements

Expected touch points for Story 3.5:

- `apps/web/src/server/services/alert-service.ts` (notification trigger integration in lifecycle transitions)
- `apps/web/src/server/services/inventory-service.ts` (confirm unchanged canonical lifecycle invocation path)
- `apps/web/src/server/services/sync-service.ts` (confirm sync replay path remains aligned)
- `apps/web/src/lib/env.ts` (add optional env var for critical alert email transport if introducing dedicated webhook)
- `apps/web/src/server/**` new notification module (recommended: service/helper dedicated to critical alert email transport)
- `apps/web/tests/unit/alerts/**` (transition + anti-spam logic)
- `apps/web/tests/unit/auth/**` or `apps/web/tests/unit/alerts/**` (email transport/payload tests)
- `apps/web/tests/integration/**` (recipient scoping, removed-member exclusion, red re-entry behavior)

Optional DB schema touch (only if implementation chooses persisted notification markers):
- `apps/web/drizzle/0017_*.sql`
- `apps/web/src/server/db/schema.ts`

### Testing Requirements

- Unit tests:
  - non-red -> red trigger detection,
  - no-send on red -> red updates,
  - re-send only after leaving red and re-entering red,
  - email payload composition and deep-link correctness.
- Integration tests:
  - tenant-scoped recipient resolution,
  - removed-member exclusion from recipient list,
  - online movement and sync replay parity for notification behavior,
  - regression coverage to ensure triage behavior remains correct.
- Reliability tests:
  - retry behavior on temporary transport failures,
  - failure logging shape without secrets/PII.
- Quality gates:
  - `bun run --cwd apps/web typecheck`
  - `bun run --cwd apps/web test:run --maxWorkers=1`

### Previous Story Intelligence

From Story 3.4 completion artifact:
- Alert lifecycle extension was implemented in one canonical service (`alert-service`) and intentionally reused from both online and sync paths.
- Concurrency guardrails were added for active-alert uniqueness conflicts (insert fallback update pattern).
- Triage API mutations were hardened with explicit tenant/active guards and deterministic error semantics.
- Tests now include focused lifecycle, integration, and UI coverage for alert triage.

Implication for Story 3.5:
- Add notification behavior as a lifecycle extension, not as a parallel alert engine.
- Preserve the anti-race and deterministic patterns already established in Story 3.4.

### Git Intelligence Summary

Recent commit sequence shows a stable delivery cadence:
1. Service/domain logic,
2. API/contracts,
3. UI adaptation,
4. Test expansion,
5. Artifact/status updates.

Recommended Story 3.5 execution order:
- implement notification trigger and transport,
- add/adjust env/schema contract if needed,
- add integration/unit coverage,
- then update artifacts/status.

### Latest Tech Information

Latest ecosystem snapshot (2026-02):
- `next`: `16.1.6` (project pinned `15.5.7`)
- `@trpc/server`: `11.10.0` (project pinned `^11.0.0`)
- `drizzle-orm`: `0.45.1` (project pinned `^0.44.0`)
- `better-auth`: `1.4.18` (project pinned `^1.3`)
- `pino`: `10.3.1` (project pinned `^10.3.0`)
- `zod`: `4.3.6` (project pinned `^3.24.2`)
- `dexie`: `4.3.0` (project aligned)
- `@tanstack/react-query`: `5.90.21` (project pinned to `^5.69.0` range)

Guidance for this story:
- Keep pinned versions during implementation.
- If upgrades become necessary, isolate them in a dedicated PR and revalidate auth, sync, and alert lifecycle behavior.

### Project Context Reference

Mandatory guardrails from `project-context.md`:
- Bun is the package manager convention.
- Shared validation schemas stay in `src/schemas/**`.
- Server is authoritative for RBAC and tenancy; never rely on UI-only gating.
- Never bypass tenant RLS context for tenant-scoped data access.
- Offline writes flow through outbox + `/api/sync`; preserve sync idempotency semantics.
- Keep structured JSON logging and strict redaction for secrets/PII.

### Story Completion Status

- Story status: `ready-for-dev`
- Completion note: `Ultimate context engine analysis completed - comprehensive developer guide created`

### Project Structure Notes

- Alignment:
  - Existing service-first backend architecture and lifecycle centralization are well-suited for adding red-alert notifications.
  - Existing auth email transport patterns provide a proven baseline for timeout/retry/logging behavior.
- Detected variances:
  - Architecture target tree documents `src/server/db/schema/**` sharded schema files, while current repository uses `apps/web/src/server/db/schema.ts` single-file schema; follow current repository convention for consistency.

### References

- Story 3.5 and Epic 3 requirements: [Source: _bmad-output/planning-artifacts/epics.md#Story-35-Email-Notifications-for-Critical-Red-Alerts-All-Tenant-Members], [Source: _bmad-output/planning-artifacts/epics.md#Epic-3-Thresholds--Alerting-Actionable-Alerts]
- FR11 baseline: [Source: _bmad-output/planning-artifacts/prd.md#2-Intelligent-Alert-System]
- Architecture boundaries and consistency rules: [Source: _bmad-output/planning-artifacts/architecture.md#Core-Architectural-Decisions], [Source: _bmad-output/planning-artifacts/architecture.md#Implementation-Patterns--Consistency-Rules], [Source: _bmad-output/planning-artifacts/architecture.md#Project-Structure--Boundaries]
- Project guardrails: [Source: _bmad-output/project-context.md#Critical-Don’t‑Miss-Rules], [Source: _bmad-output/project-context.md#Framework-Specific-Rules-Nextjs--API-Boundaries]
- Previous story intelligence: [Source: _bmad-output/implementation-artifacts/3-4-alert-triage-handled-vs-snoozed-ignored.md]
- Current code touchpoints: [Source: apps/web/src/server/services/alert-service.ts], [Source: apps/web/src/server/services/inventory-service.ts], [Source: apps/web/src/server/services/sync-service.ts], [Source: apps/web/src/server/better-auth/password-reset-email.ts], [Source: apps/web/src/server/better-auth/invitation-email.ts], [Source: apps/web/src/server/db/schema.ts], [Source: apps/web/src/lib/env.ts]

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- create-story workflow execution for Story 3.5 (auto-selected from sprint backlog)
- exhaustive artifact analysis: epics, PRD, architecture, project-context
- previous-story intelligence extraction from Story 3.4 implementation artifact
- git intelligence analysis from the 5 most recent commits
- latest dependency/version snapshot lookup for implementation risk awareness

### Completion Notes List

- Story context generated with explicit non-red -> red notification trigger semantics.
- Guardrails include anti-spam strategy, recipient scoping, retry/logging expectations, and sync parity requirements.
- Architecture and project-context constraints were embedded to reduce tenancy, sync, and regression risk.
- Story is ready for development with clear implementation boundaries and quality gates.
- ✅ Implemented critical alert notification system with webhook-based email transport.
- ✅ Added `shouldTriggerCriticalNotification` function for non-red → red transition detection.
- ✅ Added `resolveTenantMembersForCriticalAlert` function for tenant-scoped recipient resolution.
- ✅ Integrated notification trigger into `updateAlertLifecycle` for create, update, and snooze-cancellation paths.
- ✅ Created `critical-alert-email.ts` service with retry logic (2 attempts, 5s timeout, retryable status codes).
- ✅ Added `CRITICAL_ALERT_EMAIL_WEBHOOK_URL` environment variable for webhook configuration.
- ✅ All 4 acceptance criteria satisfied with comprehensive test coverage.

### File List

- `_bmad-output/implementation-artifacts/3-5-email-notifications-for-critical-red-alerts-all-tenant-members.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `apps/web/src/lib/env.ts`
- `apps/web/src/server/services/alert-service.ts`
- `apps/web/src/server/services/critical-alert-email.ts`
- `apps/web/tests/unit/alerts/alert-critical-notification.test.ts`
- `apps/web/tests/unit/alerts/critical-alert-email.test.ts`
- `apps/web/tests/integration/critical-alert-notification.test.ts`
