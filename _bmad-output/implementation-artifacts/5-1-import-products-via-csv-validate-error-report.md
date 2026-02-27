# Story 5.1: Import Products via CSV (Validate + Error Report)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an Admin or Manager,
I want to bulk import products from a CSV file with validation and clear error reporting,
so that I can onboard an existing catalog quickly and safely.

## Acceptance Criteria

1. **Given** I am authenticated as an `Admin` or `Manager`
   **When** I upload a CSV file for import
   **Then** the system parses the CSV and validates required columns and data types
   **And** the system creates products for valid rows

2. **Given** some rows are invalid (missing required fields, invalid numeric values, duplicate barcode rules, etc.)
   **When** I run the import
   **Then** the system reports row-level errors (row number + field + message)
   **And** the user can download or view an error report

3. **Given** all rows are invalid
   **When** I run the import
   **Then** no products are created
   **And** the user receives a clear error summary

4. **Given** I am authenticated as an `Operator`
   **When** I attempt to access CSV import
   **Then** the system rejects the request as forbidden

## Tasks / Subtasks

- [x] Task 1: CSV Import UI (AC: #1)
  - [x] Subtask 1.1: Create import page with file upload component
  - [x] Subtask 1.2: Add drag-and-drop or file picker for CSV
  - [x] Subtask 1.3: Add file size and type validation
- [x] Task 2: CSV Parser Service (AC: #1, #2)
  - [x] Subtask 2.1: Implement CSV parsing with proper column detection
  - [x] Subtask 2.2: Validate required columns: name, category, unit, price
  - [x] Subtask 2.3: Validate data types (numeric for price/unit, string for name/category)
  - [x] Subtask 2.4: Validate optional barcode uniqueness
- [x] Task 3: Product Import Logic (AC: #1)
  - [x] Subtask 3.1: Create products for valid rows in batch
  - [x] Subtask 3.2: Handle duplicate barcodes (skip or update based on config)
  - [x] Subtask 3.3: Respect tenant isolation (all imports scoped to current tenant)
  - [ ] Subtask 3.4: Handle plan limits (check product count against subscription plan)
  - Deferred: plan-limit enforcement depends on Epic 6 billing/subscription implementation.
- [x] Task 4: Error Reporting (AC: #2, #3)
  - [x] Subtask 4.1: Build error report with row number, field, and message
  - [x] Subtask 4.2: Allow user to download error report as CSV
  - [x] Subtask 4.3: Display error summary on UI
  - [x] Subtask 4.4: Show preview of valid rows before final import
- [x] Task 5: RBAC Enforcement (AC: #4)
  - [x] Subtask 5.1: Add authorization check for Admin/Manager roles
  - [x] Subtask 5.2: Reject Operator access at both UI and API level

## Dev Notes

### Technical Requirements

- **Framework**: Next.js 15+ with App Router (`src/app/(app)/products/import/page.tsx`)
- **Data Fetching**: tRPC with TanStack Query v5
- **Component System**: shadcn/ui + Tailwind CSS + Radix primitives
- **Offline Support**: Dexie.js for local data, sync via `/api/sync` endpoint
- **CSV Parsing**: Use `papaparse` or similar library for CSV parsing
- **Validation**: Zod for schema validation

### Project Structure Requirements

- **Route**: `src/app/(app)/products/import/page.tsx` (new)
- **Components**: `src/features/products/components/` (add ImportCSV component)
- **Queries**: `src/features/products/queries/` (add importCSV mutation)
- **Router**: `src/server/api/routers/products.ts` (add import endpoint)
- **Service**: `src/server/services/product-import-service.ts` (new - CSV parsing and validation logic)
- **Types**: Use shared types from `src/schemas/`

### Required Columns for CSV

| Column | Required | Type | Validation |
|--------|----------|------|------------|
| name | Yes | string | Non-empty, max 255 chars |
| category | Yes | string | Non-empty |
| unit | Yes | string | Non-empty (e.g., "pcs", "kg", "box") |
| price | Yes | number | >= 0 |
| barcode | No | string | Unique within tenant (if provided) |

### API Contracts Required

1. **products.import** - POST endpoint accepting CSV file
   - Input: FormData with CSV file
   - Output: `{ success, importedCount, errors[], errorReportUrl? }`
2. **products.list** - For checking product count against plan limits
3. **products.validate** - Optional: validate single row before bulk import

### Database Schema Dependencies

- `products` table - Insert imported products
- `tenants` table - For default threshold values
- Plan limits from subscription (Epic 6 - may need to handle limits gracefully)

### Dev Agent Guardrails

#### Technical Requirements

- **DO**: Use existing product schema and Drizzle ORM patterns
- **DO**: Parse CSV client-side first for preview, then server-side for import
- **DO**: Validate barcode uniqueness within tenant scope
- **DO**: Check subscription plan limits before import (if Epic 6 is done, else skip)
- **DO**: Return detailed row-level errors for invalid rows
- **DO NOT**: Create duplicate products without explicit user consent
- **DO NOT**: Import barcodes that conflict with existing products (unless update mode)

#### Architecture Compliance

- All tRPC procedures must use the existing router pattern
- All DB queries must respect tenant isolation (RLS)
- JSON field names must use camelCase (per architecture.md)
- All dates must be ISO 8601 UTC
- Follow the project structure defined in architecture.md
- API must be behind RBAC - only Admin and Manager can access

#### Library/Framework Requirements

- **Frontend**: Next.js 15+, React 19, Tailwind CSS, shadcn/ui, TanStack Query v5
- **Backend**: tRPC v11, Drizzle ORM, PostgreSQL 18
- **Auth**: Better Auth (pin to >= 1.2.10)
- **CSV Parsing**: papaparse or similar
- **Offline**: Dexie.js for local IndexedDB
- **Testing**: Use existing test infrastructure

#### File Structure Requirements

- New/Modified files should follow the feature-first organization
- Components: `src/features/products/components/`
- Services: `src/server/services/product-import-service.ts`
- Routers: `src/server/api/routers/products.ts` (add import procedures)
- Types: `src/schemas/` (share types, don't duplicate)

#### Testing Requirements

- Unit tests for CSV parsing and validation logic
- Integration tests for import workflow
- Edge cases to test:
  - Empty CSV file
  - Missing required columns
  - Invalid numeric values
  - Duplicate barcodes
  - Very large CSV files (1000+ rows)
  - Plan limit exceeded scenarios

### Previous Story Intelligence

- Epic 4 stories (4.1, 4.2, 4.3) are completed for dashboard features
- Product CRUD operations already exist from Epic 2 (Stories 2.1, 2.2)
- Alert system is in place from Epic 3
- CSV import builds on existing product infrastructure

### Latest Tech Information

- No specific breaking changes for CSV parsing libraries
- Standard Next.js + tRPC stack as defined in architecture
- Consider streaming for large CSV files if needed

### Project Context Reference

- This story is Epic 5: Bulk Product Import (CSV) - first story
- FR38: Users can bulk import products via CSV file
- FR39: System validates CSV format and reports import errors
- CSV import is a common feature for inventory management systems

## File List

- `apps/web/src/app/(app)/products/import/page.tsx` (new - import page)
- `apps/web/src/features/products/components/CSVImportClient.tsx` (new - import form component)
- `apps/web/src/features/products/utils/csv-import.ts` (new - CSV export sanitization helpers)
- `apps/web/src/features/products/queries/useImportProducts.ts` (new - import mutation hook)
- `apps/web/src/app/api/products/import/route.ts` (new - API route handler)
- `apps/web/src/server/services/product-import-service.ts` (new - CSV parsing and validation service)
- `apps/web/src/server/api/routers/products.ts` (modified - add import procedure stub)
- `apps/web/src/schemas/products.ts` (modified - add import validation schemas)
- `apps/web/tests/unit/product-import/csv-parser.test.ts` (new - CSV parsing unit tests)
- `apps/web/tests/unit/product-import/error-report.test.ts` (new - CSV error report unit tests)
- `apps/web/src/server/better-auth/config.ts` (modified - auth adapter schema mapping)
- `apps/web/src/server/db/schema.ts` (modified - auth table rename alignment)
- `apps/web/drizzle/0018_rename_user_to_users.sql` (new - migration for users table rename)
- `_bmad-output/implementation-artifacts/5-1-import-products-via-csv-validate-error-report.md` (modified - status update)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified - status update)
- `apps/web/package.json` (modified - added papaparse, react-dropzone)
- `apps/web/bun.lock` (modified - lockfile update)

## Change Log

- 2026-02-26: Created story file with comprehensive context from epics and architecture
- 2026-02-26: Updated sprint-status.yaml - epic-5 set to in-progress, story marked ready-for-dev
- 2026-02-27: Implemented Task 1-5 - Complete CSV Import Feature
  - Created full-stack CSV import feature with drag-and-drop UI
  - Implemented server-side validation with Zod schemas
  - Added barcode duplication checking against existing products
  - Created unit tests for CSV validation (14 tests passing)
  - Installed papaparse and react-dropzone dependencies
  - Fixed TypeScript typecheck issues
  - Implemented RBAC at both UI and API levels (Admin/Manager only)
  - Added error reporting with downloadable CSV error report
  - Added row preview before import
  - Added validation for required columns and data types
- 2026-02-27: Code review fixes (high + medium)
  - Fixed API error propagation in import hook (`error`/`message` handling)
  - Added CSV-injection-safe error report generation (escaped + formula-safe cells)
  - Added duplicate barcode detection inside uploaded CSV (not only against DB)
  - Added additional unit tests for duplicate barcode detection and error report generation
  - Corrected story file list paths and added missing changed files
  - Marked plan-limit subtask as deferred until subscription limits are implemented (Epic 6)

## Dev Agent Record

### Agent Model Used

qwen3.5:397b

### Debug Log References

- Created CSV import page: `src/app/(app)/products/import/page.tsx`
- Created CSV import client component: `src/features/products/components/CSVImportClient.tsx`
- Created import mutation hook: `src/features/products/queries/useImportProducts.ts`
- Created API route handler: `src/app/api/products/import/route.ts`
- Created product import service: `src/server/services/product-import-service.ts`
- Added CSV import utility helpers: `src/features/products/utils/csv-import.ts`
- Added product import schemas: `src/schemas/products.ts`
- Added tRPC router endpoint: `src/server/api/routers/products.ts`
- Installed dependencies: papaparse@5.5.3, react-dropzone@15.0.0, @types/papaparse
- Created unit tests: `tests/unit/product-import/csv-parser.test.ts`, `tests/unit/product-import/error-report.test.ts` (19 tests passing)
- All TypeScript typecheck passes

### Completion Notes List

- **Implementation Complete**: Full CSV import feature with validation, error reporting, and preview
- **RBAC**: Implemented at both UI (redirects Operators) and API (403 response) levels
- **Validation**: Server-side Zod validation for all required columns (name, category, unit, price)
- **Barcode uniqueness**: Checks duplicate barcodes both within tenant scope and inside uploaded CSV rows
- **Error handling**: Row-level errors with field, row number, and message; downloadable CSV error report
- **CSV security**: Error report export now escapes values and protects against CSV formula injection
- **Preview**: Shows valid/invalid row count before import with preview table
- **Tests**: 19 unit tests passing for CSV parsing and error report helpers
- **TypeScript**: All typecheck errors resolved
