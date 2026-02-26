# Story 4.1: Dashboard Stock Overview (Alerts-First + Key Stats)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a tenant user,
I want a dashboard that shows critical and attention alerts first plus key stats,
so that I can know what needs action immediately.

## Acceptance Criteria

1. **Given** I am authenticated as `Admin`, `Manager`, or `Operator`
   **When** I open the dashboard
   **Then** I see an alerts-first layout with `red` alerts displayed before `orange` alerts
   **And** each alert entry clearly shows product name and criticality (R/O/G visual system)

2. **Given** there are multiple active alerts
   **When** I view the dashboard
   **Then** alerts are sorted by criticality and urgency (red first, then orange)

3. **Given** I view the dashboard
   **When** key stats are displayed
   **Then** I can see at minimum: total number of products, number of active alerts, and PMI indicator

4. **Given** there are no active alerts
   **When** I open the dashboard
   **Then** I see a reassuring empty state (green)
   **And** a clear CTA to record a movement or view inventory

## Tasks / Subtasks

- [x] Task 1: Dashboard layout and routing (AC: #1, #2)
  - [x] Subtask 1.1: Create dashboard page route at `/dashboard` in `(app)` group
  - [x] Subtask 1.2: Implement alerts-first layout with R/O/G sorting
- [x] Task 2: Alert list component (AC: #1, #2)
  - [x] Subtask 2.1: Build AlertCard component with product name and R/O/G badge
  - [x] Subtask 2.2: Implement sorting logic (red before orange)
  - [x] Subtask 2.3: Add infinite scroll/pagination for many alerts
- [x] Task 3: Key stats display (AC: #3)
  - [x] Subtask 3.1: Create StatsBar component with total products count
  - [x] Subtask 3.2: Add active alerts count
  - [x] Subtask 3.3: Integrate PMI indicator (Story 4.3 dependency - use placeholder for now)
- [x] Task 4: Empty state (AC: #4)
  - [x] Subtask 4.1: Design green reassuring empty state
  - [x] Subtask 4.2: Add CTA buttons for recording movement or viewing inventory
- [x] Task 5: tRPC integration (AC: all)
  - [x] Subtask 5.1: Create/get `dashboard` router with stats query
  - [x] Subtask 5.2: Implement `alerts.list` query for active alerts sorted by priority

## Dev Notes

### Technical Requirements

- **Framework**: Next.js 15+ with App Router (`src/app/(app)/dashboard/page.tsx`)
- **Data Fetching**: tRPC with TanStack Query v5
- **Component System**: shadcn/ui + Tailwind CSS + Radix primitives
- **Offline Support**: Dexie.js for local data, sync via `/api/sync` endpoint
- **PMI Placeholder**: Display "N/A" or loading state until Story 4.3 implements PMI calculation
- **Sorting**: Query must sort by `alertLevel` (red=1, orange=2, green=3) then by `updatedAt` descending

### Project Structure Requirements

- **Route**: `src/app/(app)/dashboard/page.tsx`
- **Components**: `src/features/dashboard/components/`
- **Queries**: `src/features/dashboard/queries/`
- **Router**: `src/server/api/routers/dashboard.ts`
- **Service**: `src/server/services/dashboard-service.ts`
- **Types**: Use shared types from `src/schemas/`

### API Contracts Required

1. **dashboard.stats** - Returns `{ totalProducts, activeAlertsCount, pmi }`
2. **alerts.list** - Returns `Alert[]` sorted by priority with pagination
3. **products.list** - For total count (may be existing endpoint)

### Database Schema Dependencies

- `products` table for total count
- `alerts` table for active alerts list and count
- Alert levels: `red` (critical), `orange` (attention), `green` (healthy)

### Code Patterns

- Use `camelCase` for JSON/TypeScript, `snake_case` for PostgreSQL
- ISO 8601 UTC for all timestamps
- Use Zod schemas for input validation
- Follow RBAC: all roles (Admin, Manager, Operator) can view dashboard

### Source References

- Epic 4 requirements: [Source: _bmad-output/planning-artifacts/epics.md#Epic-4]
- Acceptance criteria BDD format: [Source: _bmad-output/planning-artifacts/epics.md#Story-4.1]
- Dashboard route structure: [Source: _bmad-output/planning-artifacts/architecture.md#Project-Structure]
- Feature-first organization: [Source: _bmad-output/planning-artifacts/architecture.md#Pattern-Categories]
- tRPC patterns: [Source: _bmad-output/planning-artifacts/architecture.md#API-Boundaries]
- R/O/G visual system: [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Visual-Intelligence]
- PMI indicator concept: [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Stress-Reduction]
- Mobile-first responsive: [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Platform-Strategy]

### Previous Story Intelligence

No previous stories in Epic 4 - this is the first story.

## Dev Agent Record

### Agent Model Used

minimax-m2.5-free

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- Implemented infinite scroll/pagination for alerts list using IntersectionObserver and tRPC useInfiniteQuery
- Added cursor-based pagination to alert-service with proper sorting by level (red, orange, green) and updatedAt
- Updated schema with pagination input (cursor, limit) and output (nextCursor)
- Code review fixes applied: restored server-side auth + tenant membership guard on dashboard route
- Code review fixes applied: extracted client dashboard UI to dedicated component and invalidated `dashboard.stats` after triage actions
- Code review fixes applied: fixed cursor pagination stability and added urgency ordering by stock level within same alert level
- Code review fixes applied: aligned dashboard active alert count with visible list (exclude currently snoozed alerts)
- Added focused tests for dashboard route guards and alert pagination/urgency behavior

### File List

- `src/app/(app)/dashboard/page.tsx` - Server-guarded dashboard route wrapper (auth + membership checks)
- `src/features/dashboard/components/dashboard-page-client.tsx` - Client dashboard UI and alert actions with stats invalidation
- `src/features/dashboard/components/AlertCard.tsx` - Alert display component
- `src/features/dashboard/components/StatsBar.tsx` - Stats display component
- `src/features/dashboard/components/EmptyState.tsx` - Empty state component (cleanup)
- `src/features/dashboard/queries/useDashboardStats.ts` - Stats query hook
- `src/features/dashboard/queries/useAlerts.ts` - Alerts query hook (infinite query)
- `src/features/alerts/components/active-alerts-list.tsx` - Triage actions now invalidate dashboard stats
- `src/server/api/routers/dashboard.ts` - Dashboard router (cleanup)
- `src/server/api/routers/alerts.ts` - Alerts router (pagination)
- `src/server/services/alert-service.ts` - Stable cursor pagination + urgency sorting
- `src/server/services/dashboard-service.ts` - Active alert count excludes snoozed alerts
- `src/schemas/alerts.ts` - Alert schemas for paginated list I/O
- `tests/integration/alert-triage.test.ts` - Added pagination/urgency/dashboard-stats assertions
- `tests/unit/dashboard/dashboard-page.test.tsx` - Added route guard unit tests
