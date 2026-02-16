# Story 2.3: Record Stock Entry/Exit (Offline, 3-Click Loop)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a tenant user,
I want to record a stock entry or stock exit with only type and quantity, even offline,
so that I can update inventory fast during daily operations.

## Acceptance Criteria

1. **Given** I am authenticated as `Admin`, `Manager`, or `Operator`
   **When** I record a stock movement by selecting a product, choosing type (`entry` or `exit`), and entering `quantity` (> 0)
   **Then** the movement is saved locally immediately (even offline)
   **And** the UI confirms success without waiting for sync

2. **Given** I am offline
   **When** I record a movement
   **Then** the movement is queued/pending sync
   **And** the app shows a non-blocking sync status indicator

3. **Given** I provide an invalid quantity (empty, zero, negative, non-numeric)
   **When** I attempt to validate the movement
   **Then** the app shows a field-level validation error
   **And** the movement is not created locally

4. **Given** a movement is recorded locally
   **When** the movement is saved
   **Then** the product's available stock is recalculated locally immediately (derived from movements)
   **And** the updated stock is reflected in the product list/details

5. **Given** the sync later completes successfully
   **When** the server acknowledges the movement
   **Then** the movement is marked synced locally
   **And** the local stock remains consistent with the server-authoritative result (conflicts handled per sync strategy)

## Tasks / Subtasks

- [x] Implement 3-click movement form UI (AC: 1, 2, 3)
  - [x] Create movement form with product selector, type toggle (entry/exit), quantity input
  - [x] Implement quick-select UI for last 5 used products (performance optimization)
  - [x] Add quantity validation (required, > 0, numeric)
  - [x] Auto-focus first field on form open
  - [x] Use numeric keyboard on mobile quantity field

- [x] Implement offline movement persistence (AC: 1, 2, 4)
  - [x] Extend Dexie schema to support stock movements
  - [x] Add createMovement operation in outbox module
  - [x] Persist movements locally with pending-sync status
  - [x] Implement local stock calculation from movement ledger
  - [x] Update product list to show recalculated stock immediately

- [x] Implement server-side movement API (AC: 5)
  - [x] Add stock-movements router with create procedure
  - [x] Enforce RBAC: all authenticated roles can record movements
  - [x] Maintain tenant isolation on all mutations
  - [x] Add movement validation (product exists, quantity > 0)
  - [x] Implement idempotency key handling for sync endpoint

- [x] Implement stock recalculation logic (AC: 4)
  - [x] Create server-side stock calculation service
  - [x] Handle entry (+quantity) and exit (-quantity) movement types
  - [x] Update current_stock on product after movement
  - [x] Handle conflicts using LWW strategy (server timestamps)

- [x] Add sync status integration (AC: 2)
  - [x] Integrate with existing sync-status-summary component
  - [x] Show pending movement count in status indicator
  - [x] Ensure movements sync automatically when online

- [x] Add comprehensive tests (AC: all)
  - [x] Unit tests for movement form validation
  - [x] Unit tests for local stock calculation
  - [x] Integration tests for movement API with RBAC
  - [x] Integration tests for tenant isolation on movements
  - [x] E2E tests for offline movement recording
  - [x] E2E tests for movement sync and conflict handling

- [x] Run verification gates (AC: all)
  - [x] `bun run --cwd apps/web typecheck`
  - [x] `bun run --cwd apps/web test:run --maxWorkers=1`

## Dev Notes

This story builds on Story 2.1 (Create Product) and Story 2.2 (Edit/Delete Products) foundation, adding the critical stock movement recording capability that is central to the inventory management core. The focus is on maintaining the offline-first discipline while achieving the "3-click loop" UX requirement for speed during daily operations.

### Developer Context

**Foundation from Stories 2.1 and 2.2:**
- Offline module exists at `apps/web/src/features/offline/` with Dexie database, outbox queue, and product operations
- Product schema includes: `name`, `category`, `unit`, `price`, `barcode`, `purchasePrice` (role-gated), and `currentStock` (derived)
- RBAC utilities: `canViewPurchasePrice`, `canWritePurchasePrice` in `~/server/auth/rbac-policy.ts`
- ProductsTable component exists with edit/delete actions and sync status indicators
- Product filters (category, search, on-alert) are implemented and working
- Dexie schema supports create/update/delete operations with soft-deletes
- Outbox pattern with idempotency keys is established
- Mobile-optimized views with swipe actions exist

**Current State:**
- Products can be created, edited, and deleted offline
- Product list shows synced products with filters
- Sync status summary shows pending operations count
- No stock movement capability exists yet
- Products have `currentStock` field (placeholder or derived)

**Key Patterns to Reuse:**
- Dexie outbox pattern for offline operations
- Zod schema validation shared between client and server
- Product selector component patterns from product list
- Sync status integration from Story 2.2
- Mobile-first quick-action design patterns

### Technical Requirements

**Offline-First Discipline:**
- All movements must write to local IndexedDB first, return immediate UI feedback
- Operations are queued in outbox with `operationId` for idempotency
- No blocking on network availability - users can record movements while offline
- Local stock is source of truth until sync completes
- Stock recalculation happens locally immediately after movement

**3-Click UX Requirement:**
- Click 1: Open movement form (or quick-access button)
- Click 2: Select product (or use quick-select for recent)
- Click 3: Enter quantity and confirm (or tap type + quantity in one flow)
- Total interaction should complete in < 10 seconds for 80-90% of cases
- Numeric keyboard auto-focuses on quantity field
- Large touch targets (56px minimum) for flour-covered hands

**Data Model Requirements:**
- `stock_movements` table: id, tenantId, productId, type (entry/exit), quantity, idempotencyKey, clientCreatedAt, serverCreatedAt, syncedAt
- Movement is append-only (never update/delete)
- `currentStock` on products derived from SUM of movements
- Use server timestamps for conflict resolution (LWW)

**RBAC Enforcement:**
- Admin, Manager, Operator: All can record movements
- No special restrictions on movement recording roles
- Server remains authoritative for all operations

### Architecture Compliance

**Project Structure:**
- Movement UI: `apps/web/src/features/inventory/components/` (new folder)
- Movement routes: `apps/web/src/app/inventory/` (new)
- Offline layer: Extend `apps/web/src/features/offline/` (movement operations)
- Server API: Create `apps/web/src/server/api/routers/stock-movements.ts` (new router)
- Schema: Create/extend in `apps/web/src/schemas/stock-movements.ts`

**Data Flow:**
```
User Action → Local Validation → Dexie Update → Outbox Queue → UI Update (stock recalculated)
                                                      ↓
                                             Sync (Story 2.5)
                                                      ↓
                                             Server Persistence → Stock Update
```

**Naming Conventions:**
- Files: `kebab-case` (e.g., `stock-movement-form.tsx`)
- Variables/functions: `camelCase`
- Components/types: `PascalCase`
- API/JSON: `camelCase`
- Database: `snake_case`

**Boundaries:**
- Client code never imports from `src/server/**`
- Business logic lives in services; routers remain thin
- All tenant-scoped operations use RLS context helper
- No cross-feature imports (except via shared layers)

### Library & Framework Requirements

**Core Stack (reuse existing):**
- Next.js 15.5.7, React 19, TypeScript 5, tRPC 11
- Drizzle ORM 0.44.x, Better Auth 1.3.x, Zod 3.24.x
- TanStack Query 5, Dexie
- shadcn/ui components for forms, dialogs, tables

**New Dependencies (likely needed):**
- None major - reuse existing patterns
- Consider numeric input component from shadcn

**Version Constraints:**
- Maintain current versions; defer upgrades to dedicated PRs per architecture
- Better Auth must stay >= 1.2.10 (security requirement)

### File Structure Requirements

**New/Modified Files:**

```
apps/web/src/
├── features/
│   ├── inventory/                    # NEW: Inventory feature module
│   │   ├── components/
│   │   │   ├── stock-movement-form.tsx      # NEW: 3-click movement form
│   │   │   ├── movement-type-toggle.tsx     # NEW: Entry/Exit toggle
│   │   │   ├── product-selector.tsx         # NEW: Product quick-select
│   │   │   ├── recent-products.tsx          # NEW: Quick-select last 5
│   │   │   └── movement-history.tsx         # NEW: Movement list (Story 2.4 base)
│   │   ├── hooks/
│   │   │   ├── use-stock-movements.ts       # NEW: Movement data hook
│   │   │   └── use-local-stock.ts           # NEW: Local stock calc hook
│   │   └── utils/
│   │       └── stock-calculator.ts          # NEW: Stock from movements
│   ├── products/
│   │   └── components/
│   │       └── products-table.tsx   # MODIFY: Add current stock display
├── features/offline/
│   ├── database.ts           # MODIFY: Add stock_movements table
│   ├── outbox.ts             # MODIFY: Add movement operation types
│   └── movement-operations.ts # NEW: createMovement, getMovements
├── app/
│   ├── inventory/
│   │   ├── page.tsx          # NEW: Movement recording page
│   │   └── movements/
│   │       └── page.tsx     # NEW: Movement history (Story 2.4)
│   └── api/
│       └── sync/
│           └── route.ts      # MODIFY: Handle movement sync
├── server/
│   ├── api/
│   │   └── routers/
│   │       └── stock-movements.ts  # NEW: Movement CRUD procedures
│   └── services/
│       └── inventory-service.ts     # MODIFY: Add stock calculation
├── schemas/
│   └── stock-movements.ts    # NEW: Movement Zod schemas
└── tests/
    ├── unit/
    │   └── inventory/
    │       └── stock-calculator.test.ts  # NEW
    ├── integration/
    │   └── stock-movements.test.ts      # NEW
    └── e2e/
        └── inventory-movements.test.ts  # NEW
```

### Testing Requirements

**Unit Tests:**
- Movement form validation: Test entry/exit toggle, quantity validation
- Stock calculator: Test entry adds, exit subtracts, handles empty movements
- Idempotency: Test duplicate movement prevention

**Integration Tests:**
- Movement API: Test create with proper RBAC (all roles)
- Tenant isolation: Verify cross-tenant movements are blocked
- Stock calculation: Verify server-side stock matches local calculation

**E2E Tests:**
- Offline movement flow: Record movement offline, verify local persistence, verify sync queue
- 3-click UX: Verify complete flow in < 10 seconds
- Stock update: Verify product stock updates after movement

**Verification Commands:**
```bash
bun run --cwd apps/web typecheck
bun run --cwd apps/web test:run --maxWorkers=1
```

### Previous Story Intelligence

**From Story 2.2 (Edit/Delete Products):**

**Patterns That Worked:**
- Dexie + outbox pattern for offline-first writes
- Zod schema shared between client forms and server validation
- Immediate local persistence with pending-sync UI indicators
- Soft-delete pattern for product deletion
- Mobile-optimized views with swipe actions
- Filter state persistence in URL query params
- Integration with existing sync-status-summary component
- Transactional Dexie operations for data consistency

**Technical Decisions:**
- Dexie for IndexedDB abstraction (proven, clean API)
- Separated offline module from UI components
- Created reusable form patterns in components
- Added operationId for idempotency in outbox operations
- Local filter merge between Dexie and server data

**Files Created in Story 2.2 (Reference for Patterns):**
- `apps/web/src/features/offline/database.ts` - Dexie schema
- `apps/web/src/features/offline/outbox.ts` - Outbox queue management
- `apps/web/src/features/offline/product-operations.ts` - Product CRUD helpers
- `apps/web/src/features/products/components/products-table.tsx` - Table display
- `apps/web/src/features/products/components/product-filters.tsx` - Filter UI
- `apps/web/src/features/products/hooks/use-product-filters.ts` - Filter state

**Key Learnings:**
- Local state must be source of truth until sync completes
- Pending-sync status improves user confidence
- Mobile-first design with large touch targets is critical
- URL query params enable shareable filtered views
- Transactional operations prevent partial state

**From Story 2.1 (Create Product):**

**Foundation Patterns:**
- Dexie database setup with product schema
- Outbox pattern for offline writes
- Product serializer for Operator price masking
- Feature-based folder organization

### Latest Technical Information

**Current Repository Stack:**
- Next.js: 15.5.7
- React: 19.x
- TypeScript: 5.x
- tRPC: 11.0.0
- Drizzle ORM: 0.44.x
- Better Auth: 1.3.x
- Zod: 3.24.x
- TanStack Query: 5.69.0
- Dexie: (existing from Story 2.1)

**Available shadcn/ui Components:**
- Button, Input, Label, Card, Dialog
- Table, DropdownMenu, Select
- Toast/Sonner for notifications
- Form (with react-hook-form integration)
- Toggle (for entry/exit)
- NumberInput (for quantity)

**Database Schema Context:**
- `products` table: id, tenantId, name, category, unit, price, barcode, purchasePrice, currentStock, createdAt, updatedAt, deletedAt
- `stock_movements` table: (NEW - for this story)
  - id, tenantId, productId, type (entry/exit), quantity, idempotencyKey, clientCreatedAt, serverCreatedAt, syncedAt
- RLS policies enforce tenant isolation

**Sync Architecture (Future Story 2.5):**
- REST endpoint: `POST /api/sync`
- Payload: `{ checkpoint, results: [...] }`
- Conflict resolution: Last-Modified-Wins (server authoritative)
- Idempotency: `(tenant_id, operation_id)` deduplication

### Project Context Reference

**Critical Implementation Rules:**
- Offline flows must write to local outbox first; no direct server writes from offline UI paths [Source: _bmad-output/project-context.md#Critical Implementation Rules]
- Tenant isolation via `SET LOCAL app.tenant_id` helper and RLS policies [Source: _bmad-output/project-context.md#Critical Don't-Miss Rules]
- Operators must never receive `purchasePrice` from API responses [Source: _bmad-output/project-context.md#Critical Don't-Miss Rules]
- API/JSON contracts: `camelCase`; DB schema: `snake_case` [Source: _bmad-output/project-context.md#Language-Specific Rules]
- Business logic in server services; routers remain thin [Source: _bmad-output/project-context.md#Framework-Specific Rules]
- Inventory ledger: `stock_movements` is append-only for audit/offline correctness; do not update/delete movements as a "fix" [Source: _bmad-output/project-context.md#Critical Don't-Miss Rules]
- Offline conflict policy: server timestamps/versions are authoritative (LWW); do not arbitrate using client clocks [Source: _bmad-output/project-context.md#Critical Don't-Miss Rules]

**UX Requirements:**
- 3-click maximum for movement recording (select product → enter quantity → confirm)
- Target: < 10 seconds for 80-90% of movements
- Quick-select for last 5 used products to speed up repeat operations
- Numeric keyboard auto-focus on quantity field
- Large touch targets (56px minimum)
- Immediate visual feedback for all actions (haptic + visual)
- Offline indicator only when needed (invisible sync when online)
- Confirmation toast after movement saved locally

**Performance Considerations:**
- Local stock calculation must be fast (memoized)
- Product selector should support search/filter
- Recent products list cached for quick access
- Optimistic UI updates for perceived performance

### References

- Story requirements: [Source: _bmad-output/planning-artifacts/epics.md#Story-2.3-Record-Stock-EntryExit-Offline-3-Click-Loop]
- Epic 2 context: [Source: _bmad-output/planning-artifacts/epics.md#Epic-2-Offline-First-Inventory-Core]
- Architecture patterns: [Source: _bmad-output/planning-artifacts/architecture.md]
- UX specifications: [Source: _bmad-output/planning-artifacts/ux-design-specification.md]
- Project rules: [Source: _bmad-output/project-context.md]
- Previous story implementation: [Source: _bmad-output/implementation-artifacts/2-2-edit-delete-products-product-list-filters-offline-first.md]
- Foundation story: [Source: _bmad-output/implementation-artifacts/2-1-create-product-offline-first.md]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Story 2.3 created with comprehensive developer context
- Ultimate context engine analysis completed - comprehensive developer guide created
- ✅ **2026-02-16** - Story implementation completed
  - Implemented 3-click movement form UI with product selector, type toggle, and quantity input
  - Extended Dexie database schema to support stock movements with proper indexing
  - Created offline-first movement operations with outbox queue integration
  - Built server-side inventory service with tenant isolation and idempotency handling
  - Added stock calculation logic for local and server-side stock management
  - Created comprehensive test suite (12 unit tests for form validation, 5 unit tests for stock calculator)
  - All TypeScript checks pass with zero errors
  - All new tests pass successfully
  - Database migration generated for stock_movements table
  - Follows all project patterns from Stories 2.1 and 2.2
  - Maintains offline-first discipline with immediate local persistence
  - Implements proper RBAC enforcement for all authenticated roles
  - Uses shared Zod schemas between client and server for validation consistency
- ✅ **2026-02-16** - Code review fixes applied (HIGH + MEDIUM)
  - Added automatic pending movement sync loop (online event + polling) with local sync status transitions (`pending` → `processing` → `synced`/`failed`)
  - Added idempotency key propagation from offline queue to server API and deduplication handling
  - Added membership enforcement and proper `TRPCError` mapping in stock movement router
  - Wrapped server movement persistence + product stock update in a single DB transaction
  - Updated inventory page to display non-blocking sync status indicator
  - Implemented recent products from actual movement history (last 5 unique products used)
  - Updated local product quantity immediately when movement is recorded offline
  - Added integration tests for movement API (RBAC, tenant isolation, idempotency)
  - Added e2e-style offline movement tests for local persistence + sync status updates

### File List

**New Files:**
- `apps/web/src/schemas/stock-movements.ts` - Zod schemas for stock movement validation
- `apps/web/src/features/offline/movement-operations.ts` - Offline movement CRUD operations
- `apps/web/src/features/inventory/components/stock-movement-form.tsx` - 3-click movement form UI
- `apps/web/src/features/inventory/components/product-selector.tsx` - Product selection with quick-select
- `apps/web/src/features/inventory/components/movement-type-toggle.tsx` - Entry/exit toggle component
- `apps/web/src/server/api/routers/stock-movements.ts` - tRPC router for stock movements API
- `apps/web/src/server/services/inventory-service.ts` - Server-side inventory business logic
- `apps/web/src/app/inventory/page.tsx` - Inventory movement recording page
- `apps/web/src/tests/unit/inventory/stock-movement-form.test.ts` - Unit tests for form validation
- `apps/web/src/tests/unit/inventory/stock-calculator.test.ts` - Unit tests for stock calculation
- `apps/web/tests/integration/stock-movements.test.ts` - Integration tests for movement API
- `apps/web/tests/e2e/inventory-movements.test.ts` - E2E-style offline + sync movement tests
- `apps/web/drizzle/0011_keen_iceman.sql` - Database migration for stock_movements table

**Modified Files:**
- `apps/web/src/features/offline/database.ts` - Extended Dexie schema with stockMovements table
- `apps/web/src/features/offline/outbox.ts` - Added stockMovement entity type
- `apps/web/src/server/db/schema.ts` - Added stock_movements table and relations
- `apps/web/src/server/api/root.ts` - Added stockMovements router to app router

**Additional Existing Branch Changes (tracked for transparency):**
- `apps/web/src/app/products/[id]/edit/page.tsx`
- `apps/web/src/features/products/components/create-product-form.tsx`
- `apps/web/src/features/products/components/edit-product-form.tsx`
- `apps/web/src/features/products/components/edit-product-page-client.tsx`
- `apps/web/tests/unit/products-schema.test.ts`
