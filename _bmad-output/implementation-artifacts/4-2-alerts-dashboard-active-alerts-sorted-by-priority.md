# Story 4.2: Alerts Dashboard (Active Alerts Sorted by Priority)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a tenant user,
I want a dedicated alerts dashboard listing all active alerts sorted by priority,
so that I can triage and resolve stock risks efficiently.

## Acceptance Criteria

1. **Given** I am authenticated as `Admin`, `Manager`, or `Operator`
   **When** I open the Alerts dashboard
   **Then** I see a list of active alerts sorted by priority (red first, then orange)
   **And** each alert shows product name, criticality, current stock, and last updated time

2. **Given** an alert is `red` or `orange`
   **When** I take triage actions from the alerts list
   **Then** I can mark it as handled or snoozed (per triage rules)
   **And** the list updates immediately to reflect the new state

3. **Given** there are no active alerts
   **When** I open the Alerts dashboard
   **Then** I see a reassuring empty state and a CTA to view inventory or record a movement

4. **Given** there are many active alerts
   **When** I scroll
   **Then** the list supports pagination/infinite scroll and remains responsive

## Tasks / Subtasks

- [x] Task 1: Alerts dashboard page and routing (AC: #1, #4)
  - [x] Subtask 1.1: Create alerts dashboard page route at `/alerts` in `(app)` group
  - [x] Subtask 1.2: Implement active alerts list sorted by priority (red before orange)
  - [x] Subtask 1.3: Add infinite scroll/pagination for many alerts
- [x] Task 2: Alert list component (AC: #1, #2)
  - [x] Subtask 2.1: Build AlertListItem component with product name, criticality, stock, and timestamp
  - [x] Subtask 2.2: Integrate triage actions (handled/snoozed) from Story 3.4
  - [x] Subtask 2.3: Real-time list update after triage actions
- [x] Task 3: Empty state (AC: #3)
  - [x] Subtask 3.1: Design reassuring empty state UI
  - [x] Subtask 3.2: Add CTA buttons for viewing inventory or recording movement
- [x] Task 4: tRPC integration (AC: all)
  - [x] Subtask 4.1: Create/get `alerts.dashboard` router with active alerts query
  - [x] Subtask 4.2: Ensure pagination matches dashboard alert list behavior
  - [x] Subtask 4.3: Integrate triage action mutations (handled/snoozed)

## Dev Notes

### Technical Requirements

- **Framework**: Next.js 15+ with App Router (`src/app/(app)/alerts/page.tsx`)
- **Data Fetching**: tRPC with TanStack Query v5
- **Component System**: shadcn/ui + Tailwind CSS + Radix primitives
- **Offline Support**: Dexie.js for local data, sync via `/api/sync` endpoint
- **Reuse**: Leverage existing triage components and service from Story 3.4 (`alert-service.ts`)
- **Sorting**: Query must sort by `alertLevel` (red=1, orange=2, green=3) then by `updatedAt` descending
- **Exclude Snoozed**: Only show active (non-snoozed) alerts per Story 3.4 rules

### Project Structure Requirements

- **Route**: `src/app/(app)/alerts/page.tsx`
- **Components**: `src/features/alerts-dashboard/components/`
- **Queries**: `src/features/alerts-dashboard/queries/`
- **Router**: Reuse existing `alerts.ts` router, add `alerts.dashboard` query if needed
- **Service**: Reuse existing `alert-service.ts`
- **Types**: Use shared types from `src/schemas/`

### API Contracts Required

1. **alerts.dashboard** - Returns `Alert[]` for dashboard view (active only, sorted by priority)
2. **alerts.list** - Reuse existing endpoint with pagination (Story 4.1)
3. **alerts.triage** - Reuse existing mutation for handled/snoozed actions

### Database Schema Dependencies

- `alerts` table for active alerts list
- Alert levels: `red` (critical), `orange` (attention), `green` (healthy)
- Alert states: `active`, `handled`, `snoozed` (with snoozeUntil timestamp)
- `products` table for product name and current stock

### Code Patterns

- Use `camelCase` for JSON/TypeScript, `snake_case` for PostgreSQL
- ISO 8601 UTC for all timestamps
- Use Zod schemas for input validation
- Follow RBAC: all roles (Admin, Manager, Operator) can view alerts dashboard
- Reuse existing alert triage components from Story 3.4

### Source References

- Epic 4 requirements: [Source: _bmad-output/planning-artifacts/epics.md#Epic-4]
- Story 4.1 dashboard: [Source: _bmad-output/implementation-artifacts/4-1-dashboard-stock-overview-alerts-first-key-stats.md]
- Alert triage (Story 3.4): [Source: _bmad-output/implementation-artifacts/3-4-alert-triage-handled-vs-snoozed-ignored.md]
- Acceptance criteria BDD format: [Source: _bmad-output/planning-artifacts/epics.md#Story-4.2]
- Feature-first organization: [Source: _bmad-output/planning-artifacts/architecture.md#Pattern-Categories]
- tRPC patterns: [Source: _bmad-output/planning-artifacts/architecture.md#API-Boundaries]
- R/O/G visual system: [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Visual-Intelligence]
- Mobile-first responsive: [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Platform-Strategy]

### Previous Story Intelligence

- Story 4.1 implemented dashboard with alerts-first layout - reuse patterns
- Story 3.4 implemented alert triage (handled/snoozed) - reuse components and service
- Story 4.3 will implement PMI indicator - display placeholder or reuse from Story 4.1

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- Adversarial code-review execution with git/story discrepancy audit
- Verification runs: `bun run --cwd apps/web typecheck`
- Verification runs: `bun run --cwd apps/web test:run tests/ui/alerts-dashboard-client.test.tsx tests/ui/active-alerts-list.test.tsx`

### Completion Notes List

- Created dedicated alerts dashboard at `/alerts` route in `(app)` group
- Reused existing `AlertCard` component from Story 4.1 for alert display with triage actions
- Added dedicated `alerts.dashboard` tRPC query for Story 4.2 API contract compliance
- Added dedicated alerts dashboard query hook with infinite scroll pagination
- Reused triage mutations: `alerts.markHandled`, `alerts.snooze`
- Implemented reassuring empty state with green checkmark and CTA buttons
- Added "View All Alerts" button to main dashboard linking to `/alerts`
- Alerts sorted by priority (red first, then orange) - server-side sorting via existing service
- Fixed contradictory UI state: empty-state no longer renders when query is in error
- Synced cache invalidation to refresh dashboard stats after triage actions from `/alerts`
- Added focused UI regression tests for error-state rendering, triage invalidation, and infinite-scroll trigger

### File List

- `src/app/(app)/alerts/page.tsx` - Alerts dashboard page route with auth + membership guards
- `src/features/alerts-dashboard/components/alerts-dashboard-client.tsx` - Client component with infinite scroll and triage actions
- `src/features/alerts-dashboard/queries/use-alerts-dashboard.ts` - Dedicated query hook using `alerts.dashboard`
- `src/features/dashboard/components/dashboard-page-client.tsx` - Added "View All Alerts" button
- `src/features/dashboard/components/AlertCard.tsx` - Added alert "Updated" timestamp in card UI
- `src/server/api/routers/alerts.ts` - Added `alerts.dashboard` query endpoint
- `tests/ui/alerts-dashboard-client.test.tsx` - Added UI coverage for Story 4.2 regressions
- `_bmad-output/implementation-artifacts/4-2-alerts-dashboard-active-alerts-sorted-by-priority.md` - Updated review record, completion notes, and final story status
- `_bmad-output/implementation-artifacts/sprint-status.yaml` - Synced `4-2-alerts-dashboard-active-alerts-sorted-by-priority` to `done`

### Senior Developer Review (AI)

- Reviewer: Sokoshy (AI)
- Date: 2026-02-26
- Outcome: Changes Requested -> Fixed
- Summary:
  - Fixed all HIGH and MEDIUM findings from adversarial review.
  - Verified with typecheck and focused UI regression tests.

### Change Log

- 2026-02-26: Applied code-review fixes for Story 4.2 (API contract alignment, error/empty-state correctness, dashboard-stat invalidation, and new UI regression coverage).
