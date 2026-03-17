# Story 6.2: Enforce Plan Limits (Products + Users)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the system,
I want subscription plan limits to be enforced automatically,
so that accounts cannot exceed what they pay for.

## Acceptance Criteria

1. **Given** a tenant has a plan with limits (max products, max users)
   **When** the tenant attempts to create a product beyond the max products limit
   **Then** the system rejects the action with a clear limit error
   **And** provides a CTA/message to upgrade the plan

2. **Given** a tenant has a plan with limits (max products, max users)
   **When** the tenant attempts to invite/add a user beyond the max users limit
   **Then** the system rejects the action with a clear limit error
   **And** provides a CTA/message to upgrade the plan

3. **Given** a tenant upgrades to a plan with higher limits
   **When** the upgrade is confirmed
   **Then** previously blocked create/invite actions become allowed up to the new limits

## Tasks / Subtasks

- [x] Task 1: Backend Enforcement Logic (AC: #1, #2, #3)
  - [x] Subtask 1.1: Create subscription plan enforcement service
  - [x] Subtask 1.2: Implement limit checking for product creation
  - [x] Subtask 1.3: Implement limit checking for user invitations
  - [x] Subtask 1.4: Return clear error messages with upgrade CTA
- [x] Task 2: Integration with Product and User APIs (AC: #1, #2)
  - [x] Subtask 2.1: Apply enforcement in product creation API
  - [x] Subtask 2.2: Apply enforcement in user invitation API
- [x] Task 3: Plan Upgrade Handling (AC: #3)
  - [x] Subtask 3.1: Handle plan limit updates after upgrade confirmation
  - [x] Subtask 3.2: Re-enable previously blocked actions with new limits

## Dev Notes

### Relevant Architecture Patterns and Constraints
- Use RLS for tenant isolation (architecture.md lines 150-158)
- Use centralized authorization/policy layer (architecture.md lines 215-224)
- JSON field names must use camelCase (architecture.md lines 392-396)
- All dates must be ISO 8601 UTC (architecture.md lines 413-416)
- Follow project structure defined in architecture.md (lines 604-614)
- API must be behind authentication (architecture.md line 106)

### Source Tree Components to Touch
- `apps/web/src/features/billing/` - For enforcement service (extend existing from 6.1)
- `apps/web/src/server/services/subscription-service.ts` - Extend with limit checking functions
- `apps/web/src/server/api/routers/products.ts` - Add enforcement to product creation
- `apps/web/src/server/api/routers/billing.ts` - Add user limit check for invitations
- `apps/web/src/server/db/schema/tenants.ts` - Plan limits already stored (from 6.1)

### CRITICAL: User Invitation Handling
- **IMPORTANT**: There is NO `users.ts` router for invitations
- User invitations are handled through the auth system (Epic 1, Story 1.6: "Invite User to Tenant")
- User limit enforcement MUST be added to the billing router or create a dedicated invitation endpoint
- Recommendation: Add `checkUserLimit()` function to `subscription-service.ts` and call it from:
  - The billing router when admin attempts to invite users
  - OR create new tRPC mutation in billing router for user invitation with limit check

### Testing Standards Summary
- Unit tests for subscription service limit checking
- Integration tests for product creation limit enforcement
- Integration tests for user invitation limit enforcement
- Edge cases: exact limit, over limit, limit upgrade scenarios

### Project Structure Notes
- Feature-first organization: `apps/web/src/features/billing/`
- Components: `apps/web/src/features/billing/components/`
- Services: `apps/web/src/server/services/subscription-service.ts`
- Routers: `apps/web/src/server/api/routers/billing.ts` (already exists from 6.1)
- Types: `apps/web/src/schemas/billing.ts` (share types, don't duplicate)

### IMPORTANT: Reuse Story 6.1 Implementation
- `subscription-service.ts` already has:
  - `PLAN_LIMITS` constant (Free: 20/1, Starter: 50/2, Pro: 150/3)
  - `getPlanLimits(plan)` function
  - `getCurrentUsage({db, tenantId})` returning `{productCount, userCount}`
- EXTEND these functions, DO NOT recreate them
- Add new functions: `checkProductLimit()` and `checkUserLimit()` that use existing utilities

### Alignment with unified project structure (paths, modules, naming)
- Follow existing patterns from epic 6.1 implementation
- Use same tRPC router pattern for billing
- Use same component library (shadcn/ui + Tailwind CSS + Radix primitives)

### Detected conflicts or variances (with rationale)
- None detected - following established patterns from epic 6.1

### References
- [Source: docs/architecture.md#Multi-tenancy-Isolation] - RLS implementation
- [Source: docs/architecture.md#Authorization-RBAC] - Centralized policy layer
- [Source: docs/epics.md#Story-6.2] - Acceptance criteria and FR coverage

## Dev Agent Record

### Agent Model Used
openai/nemotron-3-super-free

### Debug Log References

### Completion Notes List

- Hardened plan enforcement with tenant-row locking so product creation and invitations cannot race past the limit
- Counted pending invitations as reserved seats and enforced the same product cap in offline sync and CSV import flows
- Replaced the broken upgrade route with `/settings/billing` and added clickable upgrade CTAs in product creation, invitations, and CSV import errors
- Added unit and integration coverage for exact-limit, pending-invitation, sync, and post-upgrade scenarios
- `bun run typecheck` passes and `bun test tests/unit/billing/subscription-service.test.ts` passes; broader integration runs are currently blocked by pre-existing test harness issues (`server-only` import in auth invitation tests, legacy DB schema drift in sync/integration fixtures)

### File List

- `apps/web/src/server/services/subscription-service.ts` - Added tenant locking, pending invitation counting, and corrected billing upgrade route
- `apps/web/src/server/api/routers/products.ts` - Moved product limit enforcement inside the product creation transaction
- `apps/web/src/server/api/routers/auth.ts` - Moved invitation limit enforcement inside the invitation transaction and reserved pending seats
- `apps/web/src/server/services/sync-service.ts` - Enforced product limits for offline sync create operations
- `apps/web/src/server/services/product-import-service.ts` - Enforced remaining product capacity for CSV imports
- `apps/web/src/app/api/products/import/route.ts` - Returned a 403 for plan-limit import failures instead of masking them as 500s
- `apps/web/src/features/products/components/create-product-form.tsx` - Added clickable upgrade CTA for limit errors
- `apps/web/src/features/auth/components/invite-user-form.tsx` - Added clickable upgrade CTA for invite limit errors
- `apps/web/src/features/products/components/CSVImportClient.tsx` - Added clickable upgrade CTA for import limit errors
- `apps/web/tests/unit/billing/subscription-service.test.ts` - Expanded unit coverage for pending invitation reservation and corrected billing route assertions
- `apps/web/tests/integration/products-crud.test.ts` - Added create-at-limit and post-upgrade enforcement coverage
- `apps/web/tests/integration/auth-invitations.test.ts` - Added pending-invitation and post-upgrade invitation coverage
- `apps/web/tests/integration/sync-route.test.ts` - Added sync rejection coverage when the product cap is already exhausted

### Implementation Plan

1. **Created subscription plan enforcement service**: Added `checkProductLimit()` and `checkUserLimit()` functions to `subscription-service.ts`. These functions:
   - Fetch current subscription plan and usage counts
   - Compare against plan limits
   - Return allowed: boolean with upgrade route if limit exceeded

2. **Integrated with product creation**: Added limit check in `products.ts` router's `create` mutation before inserting product

3. **Integrated with user invitations**: Added limit check in `auth.ts` router's `createInvitation` mutation before creating invitation

4. **Plan upgrade handling**: Implementation is dynamic - limit checks always fetch current plan from database, so upgrades automatically enable more actions
