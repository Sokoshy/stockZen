# Story 4.3: PMI Indicator (MVP Formula Based on R/O/G Distribution)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a tenant user,
I want to see a Peace of Mind Index (PMI) on the dashboard,
so that I can quickly gauge overall stock health at a glance.

## Acceptance Criteria

1. **Given** products can be classified as `green`, `orange`, or `red` based on thresholds
   **When** the dashboard is displayed
   **Then** the system computes and displays a PMI score between 0 and 100
   **And** the PMI uses the MVP formula: `PMI = clamp(0..100, round(100 - (percentRed * 40 + percentOrange * 15)))`

2. **Given** the tenant has 0 products
   **When** PMI is displayed
   **Then** PMI is shown as 100 (or "N/A") with a clear explanation

3. **Given** PMI is displayed
   **When** the user views it
   **Then** the UI provides a short explanation of what influences PMI (red and orange products lower it)

4. **Given** the dashboard displays key stats (per Story 4.1 AC #3)
   **When** PMI is computed
   **Then** the PMI value is included in the stats response and displayed in the StatsBar component

## Tasks / Subtasks

- [x] Task 1: PMI calculation service (AC: #1, #2)
  - [x] Subtask 1.1: Create PMI calculation function in `dashboard-service.ts`
  - [x] Subtask 1.2: Implement MVP formula with proper edge cases (0 products, all green/red/orange)
  - [x] Subtask 1.3: Ensure calculation handles the product R/O/G distribution correctly
- [x] Task 2: Dashboard stats integration (AC: #4)
  - [x] Subtask 2.1: Update `dashboard.stats` tRPC endpoint to include PMI in response
  - [x] Subtask 2.2: Update StatsBar component to display PMI value
  - [x] Subtask 2.3: Replace PMI placeholder from Story 4.1 with real value
- [x] Task 3: PMI UI component (AC: #3)
  - [x] Subtask 3.1: Create PMIIndicator component with visual display (integrated in StatsBar)
  - [x] Subtask 3.2: Add explanation showing what influences PMI
  - [x] Subtask 3.3: Design appropriate visual representation (score, color coding)
- [x] Task 4: Edge case handling (AC: #2)
  - [x] Subtask 4.1: Handle 0 products case (show 100 or "N/A")
  - [x] Subtask 4.2: Handle case with only red/orange/green products
  - [x] Subtask 4.3: Add unit tests for PMI calculation

## Dev Notes

### Technical Requirements

- **Framework**: Next.js 15+ with App Router (`src/app/(app)/dashboard/page.tsx`)
- **Data Fetching**: tRPC with TanStack Query v5
- **Component System**: shadcn/ui + Tailwind CSS + Radix primitives
- **Offline Support**: Dexie.js for local data, sync via `/api/sync` endpoint
- **PMI Formula**: `PMI = clamp(0..100, round(100 - (percentRed * 40 + percentOrange * 15)))`
- **Edge Cases**: 
  - 0 products → PMI = 100 or "N/A"
  - All products green → PMI = 100
  - All products red → PMI = 60 (100 - 100*40 = 60)
  - All products orange → PMI = 85 (100 - 100*15 = 85)

### Project Structure Requirements

- **Route**: `src/app/(app)/dashboard/page.tsx` (existing)
- **Components**: `src/features/dashboard/components/` (existing, add PMIIndicator)
- **Queries**: `src/features/dashboard/queries/` (update for PMI)
- **Router**: `src/server/api/routers/dashboard.ts` (update)
- **Service**: `src/server/services/dashboard-service.ts` (update/add PMI calculation)
- **Types**: Use shared types from `src/schemas/`

### API Contracts Required

1. **dashboard.stats** - Returns `{ totalProducts, activeAlertsCount, pmi }` - UPDATE to include PMI
2. **products.list** - For counting total products (may be existing endpoint)
3. **alerts.list** - For active alerts dashboard card counts (reuse from Stories 4.1/4.2)

### Database Schema Dependencies

- `products` table - For counting total products
- `tenants` table - For default threshold values (critical/attention)
- Derived: PMI calculation requires product-level R/O/G classification from stock and thresholds

### Dev Agent Guardrails

#### Technical Requirements

- **DO**: Reuse existing dashboard infrastructure from Story 4.1
- **DO**: Compute PMI from product stock + threshold classification (R/O/G)
- **DO**: Implement the exact MVP formula specified in AC
- **DO**: Handle edge cases properly (0 products, all green/red/orange)
- **DO**: Add appropriate unit tests for PMI calculation
- **DO NOT**: Use a different formula without explicit approval
- **DO NOT**: Create duplicate services - reuse dashboard-service

#### Architecture Compliance

- All tRPC procedures must use the existing router pattern
- All DB queries must respect tenant isolation (RLS)
- JSON field names must use camelCase (per architecture.md)
- All dates must be ISO 8601 UTC
- Follow the project structure defined in architecture.md

#### Library/Framework Requirements

- **Frontend**: Next.js 15+, React 19, Tailwind CSS, shadcn/ui, TanStack Query v5
- **Backend**: tRPC v11, Drizzle ORM, PostgreSQL 18
- **Auth**: Better Auth (pin to >= 1.2.10)
- **Offline**: Dexie.js for local IndexedDB
- **Testing**: Use existing test infrastructure

#### File Structure Requirements

- New/Modified files should follow the feature-first organization
- Components: `src/features/dashboard/components/`
- Services: `src/server/services/dashboard-service.ts`
- Routers: `src/server/api/routers/dashboard.ts`
- Types: `src/schemas/` (share types, don't duplicate)

#### Testing Requirements

- Unit tests for PMI calculation function covering:
  - 0 products (should return 100)
  - All green products (should return 100)
  - All red products (should return 60)
  - All orange products (should return 85)
  - Mixed distributions (verify formula)
  - Edge case: very small counts

### Previous Story Intelligence

- Story 4.1 created the dashboard with a PMI placeholder
- Story 4.2 created the alerts dashboard with sorted alerts
- The PMI calculation should align with product threshold-based health classification
- Active alert counts still come from alerts lifecycle logic for dashboard stats

### Latest Tech Information

- No specific latest version requirements for this story
- Standard Next.js + tRPC stack as defined in architecture

### Project Context Reference

- This story completes Epic 4: Operational Dashboards
- The PMI indicator was referenced as a placeholder in Story 4.1
- Story 4.3 is the final story in Epic 4

## File List

- `apps/web/src/server/services/dashboard-service.ts` (modified - added PMI calculation)
- `apps/web/src/features/dashboard/components/StatsBar.tsx` (modified - added PMI display with explanation)
- `apps/web/tests/unit/dashboard/pmi-calculation.test.ts` (new - unit tests for PMI calculation)
- `apps/web/tests/integration/alert-triage.test.ts` (modified - validated PMI behavior with snoozed alerts)
- `_bmad-output/implementation-artifacts/4-3-pmi-indicator-mvp-formula-based-on-r-o-g-distribution.md` (modified - review notes, status, file list, change log)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified - synced story status)

## Change Log

- 2026-02-26: Implemented PMI calculation service with MVP formula and edge case handling
- 2026-02-26: Updated dashboard stats endpoint to include PMI in response
- 2026-02-26: Added PMI visualization with color coding and explanation tooltip
- 2026-02-26: Added unit tests for PMI calculation function
- 2026-02-26: Senior review fixes - PMI now uses product R/O/G health distribution, explanation is always visible, integration coverage updated

## Dev Agent Record

### Implementation Plan

- Created `calculatePMI` function in dashboard-service.ts with proper edge case handling
- Formula: `PMI = clamp(0..100, round(100 - (percentRed * 40 + percentOrange * 15)))`
- Edge cases handled: 0 products (returns 100), all green (100), all red (60), all orange (85)
- Color coding: green (80+), yellow (60-79), red (<60)
- Added PMI explanation text directly in StatsBar

### Completion Notes

Successfully implemented PMI (Peace of Mind Index) indicator for the dashboard. The implementation:
- Computes PMI from product health distribution (red/orange threshold classification vs total products)
- Displays PMI in StatsBar with color coding and an always-visible explanation
- All 11 unit tests pass covering edge cases and various distributions
- TypeScript typecheck passes
- Integration tests cover dashboard PMI behavior with snoozed alerts

## Senior Developer Review (AI)

### Reviewer

- Reviewer: Sokoshy (AI)
- Date: 2026-02-26
- Outcome: Changes requested were fixed, ACs validated as implemented

### Findings Addressed

- Fixed high issue: PMI was previously tied to visible active alerts; now computed from product threshold-based R/O/G distribution in `dashboard-service.ts`
- Fixed high issue: PMI explanation was hover-only; now always visible in `StatsBar` for mobile and keyboard accessibility
- Fixed medium issue: Added integration verification that snoozing affects `activeAlertsCount` but not PMI health score logic

### Verification

- `bun run test:run tests/unit/dashboard/pmi-calculation.test.ts` (pass)
- `bun run test:run tests/integration/alert-triage.test.ts --reporter=dot` (pass)
- `bun run typecheck` (pass)
