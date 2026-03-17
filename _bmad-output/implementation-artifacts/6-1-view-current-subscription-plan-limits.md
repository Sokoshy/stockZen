# Story 6.1: View Current Subscription Plan + Limits

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a tenant Admin,
I want to view my current subscription plan and its limits,
so that I understand what my account includes and when I need to upgrade.

## Acceptance Criteria

1. **Given** I am authenticated as an `Admin` in a tenant
   **When** I open the subscription/billing screen
   **Then** I can see my current plan (Free / Starter / Pro)
   **And** I can see the active limits: max products and max users
   **And** I can see my current usage vs limits (e.g., "12/20 products", "1/1 users")

2. **Given** I am authenticated as a `Manager` or `Operator`
   **When** I open the subscription/billing screen
   **Then** I can view the current plan and limits
   **And** I cannot change the plan

## Tasks / Subtasks

- [x] Task 1: Subscription/Billing Page UI (AC: #1, #2)
  - [x] Subtask 1.1: Create billing page route `src/app/(app)/settings/billing/page.tsx`
  - [x] Subtask 1.2: Display current plan name (Free/Starter/Pro)
  - [x] Subtask 1.3: Display plan limits (max products, max users)
  - [x] Subtask 1.4: Display current usage vs limits
- [x] Task 2: Subscription Data Fetching (AC: #1, #2)
  - [x] Subtask 2.1: Create tRPC query to fetch current subscription
  - [x] Subtask 2.2: Create tRPC query to fetch current usage (product count, user count)
  - [x] Subtask 2.3: Handle case where no subscription exists (Free tier default)
- [x] Task 3: Plan Limit Display (AC: #1)
  - [x] Subtask 3.1: Map plan names to limits (Free: 20 products/1 user, Starter: 50/2, Pro: 150/3)
  - [x] Subtask 3.2: Display usage progress bars or indicators
- [x] Task 4: RBAC Enforcement (AC: #2)
  - [x] Subtask 4.1: Allow Admin/Manager/Operator to view
  - [x] Subtask 4.2: Only Admin can see "change plan" CTA

## Dev Notes

### Technical Requirements

- **Framework**: Next.js 15+ with App Router (`src/app/(app)/settings/billing/page.tsx`)
- **Data Fetching**: tRPC with TanStack Query v5
- **Component System**: shadcn/ui + Tailwind CSS + Radix primitives
- **Offline Support**: Display cached subscription data when offline (read-only view)
- **Validation**: Zod for schema validation

### Project Structure Requirements

- **Route**: `src/app/(app)/settings/billing/page.tsx` (new)
- **Components**: `src/features/billing/components/` (new)
- **Queries**: `src/features/billing/queries/` (new)
- **Router**: `src/server/api/routers/billing.ts` (new)
- **Service**: `src/server/services/subscription-service.ts` (new)
- **Types**: Use shared types from `src/schemas/`

### Plan Limits Reference

| Plan   | Max Products | Max Users |
|--------|--------------|-----------|
| Free   | 20           | 1         |
| Starter| 50           | 2         |
| Pro    | 150          | 3         |

### API Contracts Required

1. **subscription.current** - Get current subscription plan
   - Input: none (tenant context from session)
   - Output: `{ plan: 'Free' | 'Starter' | 'Pro', limits: { maxProducts, maxUsers } }`
2. **subscription.usage** - Get current usage
   - Input: none
   - Output: `{ productCount, userCount }`

### Database Schema Dependencies

- `tenants` table - Store plan information per tenant
- `users` table - Count users per tenant
- `products` table - Count products per tenant
- Stripe integration (if Epic 6.3 is complete, fetch from Stripe; else use local defaults)

### Dev Agent Guardrails

#### Technical Requirements

- **DO**: Use existing tRPC router pattern for billing
- **DO**: Respect tenant isolation in all queries (RLS)
- **DO**: Use camelCase for JSON field names (per architecture.md)
- **DO**: Use ISO 8601 UTC for all dates
- **DO**: Use shadcn/ui components for consistency
- **DO NOT**: Expose raw Stripe customer IDs unless needed for display
- **DO NOT**: Allow viewing other tenants' subscription data

#### Architecture Compliance

- All tRPC procedures must use the existing router pattern
- All DB queries must respect tenant isolation (RLS)
- JSON field names must use camelCase (per architecture.md)
- All dates must be ISO 8601 UTC
- Follow the project structure defined in architecture.md
- API must be behind authentication - all authenticated users can view
- Only Admin role can see change plan option

#### Library/Framework Requirements

- **Frontend**: Next.js 15+, React 19, Tailwind CSS, shadcn/ui, TanStack Query v5
- **Backend**: tRPC v11, Drizzle ORM, PostgreSQL 18
- **Auth**: Better Auth (pin to >= 1.2.10)
- **Offline**: Display cached data when offline
- **Testing**: Use existing test infrastructure

#### File Structure Requirements

- Feature-first organization: `src/features/billing/`
- Components: `src/features/billing/components/`
- Services: `src/server/services/subscription-service.ts`
- Routers: `src/server/api/routers/billing.ts`
- Types: `src/schemas/billing.ts` (share types, don't duplicate)

#### Testing Requirements

- Unit tests for subscription service
- Integration tests for billing page
- Edge cases to test:
  - No subscription record exists (default to Free)
  - At limit usage displays correctly
  - Over-limit usage handled gracefully
  - Offline state shows cached data

### Previous Story Intelligence

- This is the first story in Epic 6 (Subscription Plans, Quotas & Invoicing)
- Epic 5 (CSV Import) was the last completed epic
- All previous epics (1-5) are complete with done status
- The architecture.md mentions Stripe integration is "planned" but not fully implemented
- Plan enforcement mechanism requires decisions (see architecture gaps)

### Latest Tech Information

- Stripe integration for billing is planned but Epic 6.3 is not yet done
- For now, use local plan definition with default Free/Starter/Pro limits
- No specific breaking changes for the tech stack
- Standard Next.js + tRPC stack as defined in architecture
- Consider future Stripe webhook integration (Epic 6.3)

### Project Context Reference

- This story is Epic 6.1: Subscription Plans, Quotas & Invoicing
- FR34: Users can view their current subscription plan
- FR33: System automatically applies subscription plan limits (enforced in Epic 6.2)
- This is a foundational story - other Epic 6 stories depend on having subscription data available

## File List

- `apps/web/src/app/(app)/settings/billing/page.tsx` (new - billing page route with server-side auth and data prefetch)
- `apps/web/src/features/billing/components/billing-overview.tsx` (new - subscription summary and role-aware CTA)
- `apps/web/src/features/billing/billing-cache.ts` (new - browser cache helpers for offline billing snapshots)
- `apps/web/src/features/billing/components/usage-display.tsx` (new - usage meters for products and users)
- `apps/web/src/features/billing/queries/useSubscription.ts` (new - subscription query hook with offline-first settings)
- `apps/web/src/features/billing/queries/useUsage.ts` (new - usage query hook with offline-first settings)
- `apps/web/src/server/api/root.ts` (updated - registered billing router)
- `apps/web/src/server/api/routers/billing.ts` (new - billing tRPC router)
- `apps/web/src/server/services/subscription-service.ts` (new - plan defaults and usage aggregation)
- `apps/web/src/schemas/billing.ts` (new - shared billing schemas)
- `apps/web/src/server/db/schema.ts` (updated - tenants now store optional subscription plan)
- `apps/web/drizzle/0019_add_tenant_subscription_plan.sql` (new - adds tenant subscription plan column)
- `apps/web/tests/integration/billing-page.test.tsx` (new - billing page integration coverage)
- `apps/web/tests/helpers/database.ts` (updated - cleanup now handles renamed `users` table)
- `apps/web/tests/helpers/ensure-test-database.ts` (updated - normalize Better Auth table rename in test DB bootstrap)
- `apps/web/tests/ui/billing-overview.test.tsx` (new - billing UI behavior coverage)
- `apps/web/tests/unit/billing-page.test.tsx` (new - billing page auth/redirect coverage)
- `apps/web/tests/unit/billing/subscription-service.test.ts` (new - subscription service unit coverage)
- `apps/web/vitest.config.ts` (updated - disable file-level parallelism for deterministic DB-backed test runs)

## Change Log

- 2026-03-17: Created story file with comprehensive context from epics and architecture
- 2026-03-17: Updated sprint-status.yaml - epic-6 set to in-progress, story marked ready-for-dev
- 2026-03-17: Implemented billing plan overview UI, billing tRPC APIs, shared billing schemas, and coverage for service/page/UI flows
- 2026-03-17: Fixed shared test database bootstrap and Vitest execution ordering so the full repository suite completes reliably
- 2026-03-17: Fixed code-review findings by persisting tenant subscription plans, caching billing snapshots for offline read-only access, and replacing mocked billing integration coverage with DB-backed tests

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Debug Log References

- `bun test:run tests/unit/billing/subscription-service.test.ts tests/integration/billing-page.test.tsx tests/ui/billing-overview.test.tsx tests/unit/billing-page.test.tsx`
- `bun typecheck`
- `bun test:run`

### Completion Notes List

- Added a new billing page at `apps/web/src/app/(app)/settings/billing/page.tsx` with authenticated access and hydrated billing queries.
- Implemented billing feature components and offline-first query hooks to show the current plan, limits, cached offline notice, and usage meters.
- Added tenant-level subscription plan persistence plus a migration so billing reflects real `Free` / `Starter` / `Pro` data instead of a hard-coded fallback.
- Added browser-side billing snapshot caching so the screen can keep rendering the latest known subscription data in read-only mode when offline.
- Added unit, UI, and DB-backed integration coverage for the billing page and subscription service, including default-Free and manager-access scenarios.
- Stabilized the shared test environment by normalizing the Better Auth `user` -> `users` table rename and disabling file-parallel Vitest execution for DB-backed integration tests.
- Validation status: targeted billing tests passed, `bun typecheck` passed, and the full `bun test:run` suite passed.
