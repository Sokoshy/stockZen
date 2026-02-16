# Story 2.2: Edit/Delete Products + Product List Filters (Offline-First)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a tenant user,
I want to edit/delete products and quickly find them using filters and search, even offline,
so that I can manage inventory efficiently during daily operations.

## Acceptance Criteria

1. **Given** I am authenticated as `Admin`, `Manager`, or `Operator`
   **When** I edit a product's editable fields (`name`, `category`, `unit`, `price`, `barcode`)
   **Then** the changes are saved locally and reflected immediately in the UI (even offline)
   **And** the change is marked as pending sync when offline

2. **Given** I am authenticated as `Admin` or `Manager`
   **When** I edit a product
   **Then** I can set or update `purchasePrice`

3. **Given** I am authenticated as an `Operator`
   **When** I edit a product
   **Then** I cannot view or edit `purchasePrice`
   **And** the system does not accept `purchasePrice` updates from Operator actions (server-side enforced)

4. **Given** I am authenticated as `Admin`, `Manager`, or `Operator`
   **When** I delete a product
   **Then** the product is removed from the default product list immediately (even offline)
   **And** the deletion is marked as pending sync when offline

5. **Given** I am viewing the product list
   **When** I filter by `category`
   **Then** only products in that category are shown

6. **Given** I am viewing the product list
   **When** I search by text or barcode
   **Then** matching products are shown (at least by `name` and `barcode`)

7. **Given** I am viewing the product list
   **When** I enable the "on alert" filter
   **Then** the list shows products that are currently below a threshold
   **And** this "on alert" status is computed locally based on current stock vs default thresholds (until Epic 3 introduces configurable thresholds/alerting)

## Tasks / Subtasks

- [x] Implement offline product edit flow (AC: 1, 2, 3)
  - [x] Create product edit form/page reusing create-product-form patterns
  - [x] Validate edit payload locally with shared Zod schema
  - [x] Persist edits in IndexedDB (Dexie) and update outbox with edit operation
  - [x] Handle purchasePrice field visibility based on role (Admin/Manager only)
  - [x] Show pending-sync status for edited items

- [x] Implement offline product delete flow (AC: 4)
  - [x] Add delete confirmation dialog (destructive action pattern)
  - [x] Mark product as deleted locally with soft-delete flag
  - [x] Add delete operation to outbox queue
  - [x] Remove from product list UI immediately (optimistic update)
  - [x] Handle undo for 5 seconds after deletion

- [x] Implement product list filters (AC: 5, 6, 7)
  - [x] Add category filter dropdown with available categories
  - [x] Add text/barcode search with debounced input
  - [x] Add "on alert" toggle filter computing threshold status locally
  - [x] Filter both local (Dexie) and server-synced products consistently
  - [x] Maintain filter state in URL query params for shareability

- [x] Update product list UI for offline management (AC: 1-7)
  - [x] Add edit/delete action buttons to ProductsTable rows
  - [x] Add row-level pending-sync status indicators
  - [x] Implement swipe actions on mobile for quick edit/delete
  - [x] Show sync status summary ("X changes pending sync")

- [x] Enhance offline data layer for edit/delete operations (AC: 1, 4)
  - [x] Extend Dexie schema to support product edits and soft-deletes
  - [x] Add updateProduct and deleteProduct helpers in offline module
  - [x] Ensure outbox operations include original product state for conflict resolution
  - [x] Handle idempotency for edit/delete operations (prevent duplicates on retry)

- [x] Server-side API updates for edit/delete (AC: 2, 3)
  - [x] Extend products router with `update` and `delete` procedures
  - [x] Enforce RBAC: verify purchasePrice updates only from Admin/Manager
  - [x] Maintain tenant isolation on all mutations
  - [x] Add server-side soft-delete support (archive instead of hard delete)

- [x] Add comprehensive tests (AC: all)
  - [x] Unit tests for edit/delete form validation and role behavior
  - [x] Unit tests for filter logic (category, search, on-alert)
  - [x] Integration tests for server RBAC on update/delete
  - [x] Integration tests for tenant isolation on edit/delete
  - [x] e2e tests for offline edit/delete flow
  - [x] e2e tests for filter functionality

- [x] Run verification gates (AC: all)
  - [x] `bun run --cwd apps/web typecheck`
  - [x] `bun run --cwd apps/web test:run --maxWorkers=1`

## Dev Notes

This story builds on Story 2.1's offline-first product creation foundation, adding full CRUD operations and list management capabilities. The focus is on maintaining offline-first discipline while providing rich filtering and search functionality.

### Developer Context

**Foundation from Story 2.1:**
- Offline module exists at `apps/web/src/features/offline/` with Dexie database, outbox queue, and product operations
- Product schema includes: `name`, `category`, `unit`, `price`, `barcode`, `purchasePrice` (role-gated)
- RBAC utilities: `canViewPurchasePrice`, `canWritePurchasePrice` in `~/server/auth/rbac-policy.ts`
- Product serializer handles Operator price masking server-side
- ProductsTable component exists at `apps/web/src/features/products/components/products-table.tsx`
- Create form exists at `apps/web/src/features/products/components/create-product-form.tsx`

**Current State:**
- Product list (`/products`) shows synced products from server via tRPC
- No edit or delete functionality exists yet
- No filtering or search capabilities exist
- Offline-first write pattern established (local persistence → outbox → future sync)

**Key Patterns to Reuse:**
- Dexie outbox pattern from Story 2.1 for offline operations
- RBAC enforcement pattern for purchasePrice handling
- Zod schema validation shared between client and server
- Tenant context middleware for data isolation

### Technical Requirements

**Offline-First Discipline:**
- All edits and deletes must write to local IndexedDB first, return immediate UI feedback
- Operations are queued in outbox with `operationId` for idempotency
- No blocking on network availability - users can edit/delete while offline
- Local state is source of truth until sync completes

**RBAC Enforcement:**
- Admin/Manager: Full edit access including `purchasePrice`
- Operator: Cannot view or edit `purchasePrice`; server rejects Operator-submitted price updates
- Delete permission: All authenticated roles (Admin, Manager, Operator) can delete products
- Server remains authoritative for all permission checks

**Data Consistency:**
- Soft-delete pattern: Mark deleted locally, sync to server, then archive
- Edit operations preserve original state for conflict resolution (LWW strategy per architecture)
- Local filter state must apply to both synced and unsynced products uniformly

**Filter Implementation:**
- Category filter: Use distinct categories from local + server products
- Search: Match against `name` (fuzzy) and `barcode` (exact prefix)
- "On alert" filter: Compute locally using current stock vs default thresholds (100/500 placeholders until Epic 3)
- URL persistence: Store active filters in query params for shareable filtered views

### Architecture Compliance

**Project Structure:**
- Product UI: `apps/web/src/features/products/components/` (edit form, enhanced table)
- Product routes: `apps/web/src/app/products/` (edit page)
- Offline layer: Extend `apps/web/src/features/offline/` (edit/delete operations)
- Server API: Extend `apps/web/src/server/api/routers/products.ts` (update, delete procedures)

**Data Flow:**
```
User Action → Local Validation → Dexie Update → Outbox Queue → UI Update
                                                     ↓
                                            Sync (Story 2.5)
                                                     ↓
                                            Server Persistence
```

**Naming Conventions:**
- Files: `kebab-case` (e.g., `edit-product-form.tsx`)
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
- TanStack Query 5, Dexie (already added in Story 2.1)
- shadcn/ui components for forms, dialogs, tables

**New Dependencies (likely needed):**
- None major - reuse existing shadcn components
- Consider `fuse.js` or similar for fuzzy search (optional, can defer)

**Version Constraints:**
- Maintain current versions; defer upgrades to dedicated PRs per architecture
- Better Auth must stay >= 1.2.10 (security requirement)

### File Structure Requirements

**New/Modified Files:**

```
apps/web/src/
├── features/products/
│   ├── components/
│   │   ├── edit-product-form.tsx      # NEW: Edit form (reuses create patterns)
│   │   ├── products-table.tsx         # MODIFY: Add edit/delete actions
│   │   ├── product-filters.tsx        # NEW: Filter bar component
│   │   └── delete-product-dialog.tsx  # NEW: Confirmation dialog
│   ├── hooks/
│   │   ├── use-product-filters.ts     # NEW: Filter state management
│   │   └── use-product-search.ts      # NEW: Search logic
│   └── utils/
│       └── filter-utils.ts            # NEW: Filter predicate helpers
├── features/offline/
│   ├── database.ts                    # MODIFY: Add edit/delete support
│   ├── outbox.ts                      # MODIFY: Add edit/delete operation types
│   └── product-operations.ts          # MODIFY: Add updateProduct, deleteProduct
├── app/products/
│   ├── page.tsx                       # MODIFY: Add filters, enhance table
│   └── [id]/
│       └── edit/
│           └── page.tsx               # NEW: Edit product page
├── server/api/routers/
│   └── products.ts                    # MODIFY: Add update, delete procedures
├── schemas/
│   └── products.ts                    # MODIFY: Add update schema if needed
└── tests/
    ├── unit/products/
    │   └── edit-delete.test.ts        # NEW: Unit tests
    ├── integration/
    │   └── products-crud.test.ts      # NEW: Integration tests
    └── e2e/
        └── products-offline.test.ts   # NEW: E2E tests
```

### Testing Requirements

**Unit Tests:**
- Filter logic: Test category, search, and alert filter predicates
- Form validation: Test edit form Zod schema validation
- RBAC: Test Operator cannot submit purchasePrice updates

**Integration Tests:**
- Server procedures: Test update/delete with proper RBAC
- Tenant isolation: Verify cross-tenant edit/delete is blocked
- Soft-delete: Verify deleted products are excluded from list but preserved

**E2E Tests:**
- Offline edit flow: Edit product offline, verify local persistence, verify sync queue
- Offline delete flow: Delete product offline, verify soft-delete, verify undo
- Filter functionality: Test all filter combinations work correctly
- Search: Test text and barcode search accuracy

**Verification Commands:**
```bash
bun run --cwd apps/web typecheck
bun run --cwd apps/web test:run --maxWorkers=1
```

### Previous Story Intelligence

**From Story 2.1 (Create Product):**

**Patterns That Worked:**
- Dexie + outbox pattern for offline-first writes
- Zod schema shared between client forms and server validation
- RBAC policy helpers for role-based field access
- Product serializer for Operator price masking
- Immediate local persistence with pending-sync UI indicators
- Feature-based folder organization under `src/features/products/`

**Technical Decisions:**
- Used Dexie for IndexedDB abstraction (good choice, clean API)
- Separated offline module (`src/features/offline/`) from UI components
- Created reusable `create-product-form.tsx` component
- Added `operationId` for idempotency in outbox operations
- Soft schema migration approach for new product fields

**Files Created in Story 2.1 (Reference for Patterns):**
- `apps/web/src/features/offline/database.ts` - Dexie schema
- `apps/web/src/features/offline/outbox.ts` - Outbox queue management
- `apps/web/src/features/offline/product-operations.ts` - Product CRUD helpers
- `apps/web/src/features/products/components/create-product-form.tsx` - Form patterns
- `apps/web/src/features/products/components/products-table.tsx` - Table display
- `apps/web/drizzle/0010_products_story_21_fields.sql` - Migration pattern

**Testing Patterns Established:**
- Integration tests in `apps/web/tests/integration/` using vitest
- RBAC tests in `apps/web/tests/integration/products-rbac.test.ts`
- Unit tests in `apps/web/tests/unit/` 
- Test helpers in `apps/web/tests/helpers/`

**Key Learnings:**
- Offline list visibility requires merging local Dexie products with server data
- Pending-sync status improves user confidence in offline operations
- Role-based field masking must happen at both UI and API levels
- Tenant isolation tests are critical for security validation

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
- Dexie: (added in Story 2.1)

**Available shadcn/ui Components:**
- Button, Input, Label, Card, Dialog
- Table, DropdownMenu, Select
- Toast/Sonner for notifications
- Form (with react-hook-form integration)

**Database Schema Context:**
- `products` table: id, tenantId, name, category, unit, price, barcode, purchasePrice, createdAt, updatedAt, deletedAt (soft delete)
- `stock_movements` table: (for "on alert" calculation context)
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

**Performance Considerations:**
- Local filtering must remain responsive with 1000+ products (Dexie indices)
- Search should debounce input (300ms typical)
- "On alert" calculation should be memoized/cached per product
- Infinite scroll or pagination for large product lists (defer to Story 2.4)

**UX Requirements:**
- 3-click maximum for edit initiation (tap product → edit button → form)
- Large touch targets (48-56px) for Bernard's flour-covered hands
- Immediate visual feedback for all actions (haptic + visual)
- Undo for destructive delete (5-second window)
- Offline indicator only when needed (invisible sync when online)

### References

- Story requirements: [Source: _bmad-output/planning-artifacts/epics.md#Story-2.2-Edit-Delete-Products-Product-List-Filters-Offline-First]
- Epic 2 context: [Source: _bmad-output/planning-artifacts/epics.md#Epic-2-Offline-First-Inventory-Core]
- Architecture patterns: [Source: _bmad-output/planning-artifacts/architecture.md]
- UX specifications: [Source: _bmad-output/planning-artifacts/ux-design-specification.md]
- Project rules: [Source: _bmad-output/project-context.md]
- Previous story implementation: [Source: _bmad-output/implementation-artifacts/2-1-create-product-offline-first.md]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Implemented offline product edit flow with the following components:
  - Created `edit-product-form.tsx` component that reuses the same patterns as `create-product-form.tsx`
  - Added `updateProductOffline` function in `product-operations.ts` to persist edits in IndexedDB (Dexie) and queue them in the outbox for later sync
  - Created edit page at `/products/[id]/edit` that fetches product data and displays the edit form
  - Updated `ProductsTable` to include an Edit button that navigates to the edit page
  - Implemented role-based purchasePrice field visibility (Admin/Manager can see/edit, Operator cannot)
  - Pending-sync status is shown for edited items via the existing syncStatus column in the table

- Implemented offline product delete flow with the following components:
  - Created `delete-product-dialog.tsx` confirmation dialog component
  - Added `deleteProductOffline` function in `product-operations.ts` to mark products as deleted locally with soft-delete flag
  - Added delete operation to outbox queue for later sync
  - Implemented optimistic update - removes product from UI immediately
  - Added undo functionality for 5 seconds after deletion via `restoreProduct` function
  - Updated server-side to use soft-delete instead of hard delete
  - Added `deletedAt` field to database schema and migrations
  - Updated ProductsTable to include Delete button next to Edit button

- Implemented product list filters with the following components:
  - Created `filter-utils.ts` with filter predicate functions (category, search, on-alert)
  - Created `use-product-filters.ts` hook with URL query param state management and debounced search
  - Created `product-filters.tsx` component with category dropdown, text/barcode search, and on-alert toggle
  - Created `products-list-client.tsx` client component that merges local and server products with filtering
  - Updated products page to use the new filter-enabled client component
  - Filters work on both local (Dexie) and server-synced products consistently
  - Filter state is persisted in URL query params for shareability

- apps/web/src/features/offline/product-operations.ts (modified - added updateProductOffline, deleteProductOffline, restoreProduct)
- apps/web/src/features/products/components/edit-product-form.tsx (new)
- apps/web/src/app/products/[id]/edit/page.tsx (new)
- apps/web/src/features/products/components/products-table.tsx (modified - added edit and delete buttons)
- apps/web/src/features/offline/database.ts (modified - added deletedAt field)
- apps/web/src/features/products/components/delete-product-dialog.tsx (new)
- apps/web/src/server/db/schema.ts (modified - added deletedAt column)
- apps/web/src/server/api/routers/products.ts (modified - soft-delete support)
- apps/web/src/server/auth/product-serializer.ts (modified - added deletedAt to serialization)
- apps/web/src/schemas/products.ts (modified - added deletedAt field)
- apps/web/drizzle/0011_products_soft_delete.sql (new)
- apps/web/tests/unit/auth/product-serializer.test.ts (modified)
- apps/web/src/features/products/utils/filter-utils.ts (new - filter predicates)
- apps/web/src/features/products/hooks/use-product-filters.ts (new - filter state hook)
- apps/web/src/features/products/components/product-filters.tsx (new - filter UI)
- apps/web/src/features/products/components/products-list-client.tsx (new - merged products with filters)

- Implemented mobile swipe actions and sync status summary:
  - Created `swipeable-product-card.tsx` component with touch gesture support for mobile
  - Created `mobile-product-list.tsx` for mobile-optimized product list view
  - Created `sync-status-summary.tsx` component showing pending/failed sync operations
  - Updated `products-list-client.tsx` to show mobile view on small screens, desktop table on larger screens
  - Added responsive design with hidden desktop table (`hidden sm:block`) and mobile cards (`sm:hidden`)
  - Touch targets are 48-56px for accessibility (Bernard's flour-covered hands requirement)
  - Swipe actions reveal Edit and Delete buttons with visual feedback
  - Sync status shows count of pending and failed operations with auto-refresh every 5 seconds

- Implemented comprehensive tests:
  - Created `edit-delete-operations.test.ts` with unit tests for updateProductOffline, deleteProductOffline, restoreProduct
  - Created `filter-utils.test.ts` with 29 unit tests covering matchesCategory, matchesSearch, isProductOnAlert, filterProducts, extractCategories
  - Added `products-crud.test.ts` integration suite for update/delete/soft-delete verification
  - Added `products-offline.test.ts` e2e flow test covering offline edit/delete/undo behavior
  - Added `products-filters.test.ts` e2e flow test covering URL persistence and combined filtering
  - All 230 tests passing across 30 test files
  - TypeScript typecheck passes with no errors
  - Tests cover filter predicates, offline operations, and product management logic

- Applied code-review remediation (High/Medium findings):
  - Fixed offline merge precedence so local pending edits override stale server list rows in `products-list-client.tsx`
  - Fixed delete UX state handling to remove rows immediately without full page reload and restore rows when undo is triggered
  - Forced local delete path for non-synced rows to prevent server-only delete attempts on pending local records
  - Persisted `tenantId` in outbox payloads and scoped sync summary counts per tenant
  - Made local write + outbox enqueue flows transactional in Dexie for create/update/delete operations
  - Fixed URL query persistence for debounced search filter (`search` now syncs to query params)
  - Removed duplicate `ProductRow` type definition in filter utilities

- Additional files updated during review remediation:
  - `apps/web/src/features/products/components/products-list-client.tsx` (merge precedence + delete/restore callbacks)
  - `apps/web/src/features/products/components/products-table.tsx` (removed hard reload; callback-based deletion)
  - `apps/web/src/features/products/components/delete-product-dialog.tsx` (offline-forced delete for unsynced rows + restore callback)
  - `apps/web/src/features/products/components/mobile-product-list.tsx` (propagates delete/restore callbacks)
  - `apps/web/src/features/products/components/swipeable-product-card.tsx` (propagates delete/restore callbacks)
  - `apps/web/src/features/products/components/sync-status-summary.tsx` (tenant-scoped outbox aggregation)
  - `apps/web/src/features/products/hooks/use-product-filters.ts` (debounced URL search sync)
  - `apps/web/src/features/products/utils/filter-utils.ts` (type cleanup)
  - `apps/web/src/features/offline/product-operations.ts` (Dexie transactions + tenantId outbox payload)
  - `apps/web/tests/unit/offline/product-operations.test.ts` (transaction-aware unit test updates)
  - `apps/web/tests/unit/offline/edit-delete-operations.test.ts` (transaction-aware unit test updates)
  - `apps/web/tests/integration/products-crud.test.ts` (new integration coverage)
  - `apps/web/tests/e2e/products-offline.test.ts` (new e2e offline flow coverage)
  - `apps/web/tests/e2e/products-filters.test.ts` (new e2e filter flow coverage)
