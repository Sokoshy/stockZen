# Story 1.2: Sign up + Create Tenant (Admin) + Start Session

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a new user,
I want to create an account and a new tenant,
So that I can start using StockZen with my organization securely isolated.

## Acceptance Criteria

1. **Given** I am not authenticated
   **When** I sign up with a valid email and password
   **Then** the system creates a new tenant and a user account
   **And** the user is added to that tenant as `Admin`
   **And** a session is created and stored server-side (DB-backed session)
   **And** an auth cookie is set (httpOnly; `secure` in production)

2. **Given** an email is already in use
   **When** I attempt to sign up with the same email
   **Then** the system rejects the request with a clear validation error
   **And** no tenant/user is created

3. **Given** I provide an invalid email or a weak/invalid password
   **When** I attempt to sign up
   **Then** the system rejects the request with field-level validation errors
   **And** no tenant/user is created

4. **Given** I just signed up successfully
   **When** I call an authenticated endpoint
   **Then** I am authenticated as the created user
   **And** all tenant-scoped access is constrained to my tenant (tenant context established for the request)

5. **Given** a server error occurs during signup
   **When** the operation fails
   **Then** the system does not leave partial data (no orphan tenant without admin user)
   **And** I receive a non-sensitive error response

## Tasks / Subtasks

- [x] Set up Better Auth with DB-backed sessions (AC: 1)
  - [x] Configure Better Auth with PostgreSQL session storage
  - [x] Implement tenant-aware session resolution
  - [x] Configure secure cookie settings (httpOnly, secure in production)

- [x] Create tenant and user schema (AC: 1)
  - [x] Create `tenants` table with UUID primary key
  - [x] Create `users` table with Better Auth integration
  - [x] Create `tenant_memberships` table linking users to tenants with roles
  - [x] Set up RLS policies for tenant isolation

- [x] Implement sign-up API endpoint (AC: 1, 2, 3, 5)
  - [x] Create tRPC mutation for user registration
  - [x] Validate email uniqueness
  - [x] Validate password strength
  - [x] Implement atomic transaction (tenant + user + membership creation)
  - [x] Handle errors gracefully with proper rollback

- [x] Implement sign-up UI (AC: 1, 2, 3)
  - [x] Create sign-up form with email/password fields
  - [x] Implement client-side validation
  - [x] Display field-level error messages
  - [x] Show loading states during submission

- [x] Set up tenant context for authenticated requests (AC: 1, 4)
  - [x] Create RLS context helper (`SET LOCAL app.tenant_id`)
  - [x] Implement middleware to establish tenant context from session
  - [x] Verify tenant isolation on all tenant-scoped queries

- [x] Write tests (AC: all)
  - [x] Unit tests for validation logic
  - [x] Integration tests for sign-up flow
  - [x] RLS anti-leak tests for tenant isolation

## Dev Notes

### Technical Requirements

**Authentication & Session Management:**
- Use Better Auth (maintained 1.x, enforce `>= 1.2.10`) with DB-backed sessions
- Cookie-based sessions: httpOnly + secure in production + signed with server secret
- Session storage in PostgreSQL with `expiresAt`, user agent, and IP tracking
- Tenant context established via `SET LOCAL app.tenant_id = '<tenant-uuid>'` per request

**Database Schema:**
- `tenants` table: `id` (UUID PK), `name`, `created_at`, `updated_at`
- `users` table: Better Auth managed fields + `id` (UUID PK)
- `tenant_memberships` table: `id`, `tenant_id` (FK), `user_id` (FK), `role` (Admin/Manager/Operator), `created_at`
- RLS policies must enforce tenant isolation on all tenant-scoped tables

**API Design:**
- tRPC mutation: `auth.signUp` with email, password inputs
- Atomic transaction: create tenant → create user → create membership (all or nothing)
- Error handling: never expose sensitive details, use generic messages for auth errors

**Validation:**
- Email: valid format, unique across system
- Password: minimum 8 characters, at least one uppercase, one lowercase, one number
- Use Zod schemas shared between server and client

### Project Structure Notes

**New files to create:**
- `apps/web/src/server/db/schema/tenants.ts` - Tenant table schema
- `apps/web/src/server/db/schema/users.ts` - User table schema (Better Auth compatible)
- `apps/web/src/server/db/schema/tenant-memberships.ts` - Membership junction table
- `apps/web/src/server/db/rls.ts` - RLS context helper
- `apps/web/src/server/auth/better-auth.ts` - Better Auth configuration
- `apps/web/src/server/api/routers/auth.ts` - Auth tRPC router with signUp mutation
- `apps/web/src/features/auth/components/sign-up-form.tsx` - Sign-up form component
- `apps/web/src/features/auth/schemas/sign-up.ts` - Sign-up validation schema
- `apps/web/drizzle/migrations/0001_tenants_users_memberships.sql` - Migration file

**Files to modify:**
- `apps/web/src/server/api/root.ts` - Add auth router
- `apps/web/src/server/db/schema.ts` - Export new schemas
- `apps/web/src/app/(auth)/signup/page.tsx` - Sign-up page (create if doesn't exist)

### Architecture Compliance

**Critical Requirements:**
- Better Auth with DB-backed sessions (no stateless JWT for primary auth)
- Postgres RLS with `tenant_id` on all tenant-scoped tables
- Atomic transactions for multi-table operations (prevent orphan tenants)
- Tenant context must be set via `SET LOCAL app.tenant_id` for every request
- Server-side authorization is authoritative (never rely on client-side checks)

**Naming Conventions:**
- DB tables/columns: `snake_case` (e.g., `tenant_id`, `created_at`)
- API/JSON: `camelCase` only (e.g., `tenantId`, `createdAt`)
- Files: `kebab-case` (e.g., `sign-up-form.tsx`)
- TypeScript: `camelCase` variables/functions, `PascalCase` types/components

**Boundaries:**
- Auth logic in `src/server/auth/**`
- API routes in `src/server/api/routers/**`
- UI components in `src/features/auth/components/**`
- Schemas in `src/schemas/**` or `src/features/auth/schemas/**`
- Never import `src/server/**` from client code

### Library & Framework Requirements

**Core Stack:**
- Better Auth: `>= 1.2.10` (pin to maintained 1.x)
- Drizzle ORM: 0.44.x line
- tRPC: v11
- Zod: validation schemas
- React Hook Form: form handling

**Security:**
- bcrypt for password hashing (cost >= 12)
- Secure cookie configuration
- Rate limiting on auth endpoints

### Testing Requirements

**Unit Tests:**
- Password validation logic
- Email format validation
- Role assignment logic

**Integration Tests:**
- Sign-up flow end-to-end
- Tenant creation with user association
- Session creation and validation

**Critical RLS Tests:**
- Verify user from Tenant A cannot access Tenant B data
- Verify tenant isolation on all new tables
- Verify `SET LOCAL app.tenant_id` is working correctly

### Previous Story Intelligence

**From Story 1.1:**
- Project scaffolded with Create T3 App in `apps/web`
- Drizzle ORM configured with 0.44.x line
- Better Auth baseline installed
- Folder structure established:
  - `apps/web/src/server/**` for server code
  - `apps/web/src/features/**` for feature modules
  - `apps/web/src/schemas/**` for shared schemas
  - `apps/web/drizzle/migrations/` for SQL migrations
- pino logger configured for structured logging

**Patterns Established:**
- Use Bun as package manager (commit `bun.lock`)
- tRPC for internal API contracts
- Feature-first organization
- Server/client boundaries enforced

**Technical Debt/Notes:**
- Better Auth GitHub env vars were set as dummy values for dev - update for production
- Next.js aligned to 15.5.7
- Drizzle table filtering fixed

### Latest Tech Information

**Better Auth (v1.2.10+):**
- Supports DB-backed sessions out of the box
- Built-in email/password provider with validation hooks
- Configurable session expiration
- Support for custom user fields and relations

**Drizzle ORM (0.44.x):**
- Use `drizzle-zod` for schema validation
- Migrations via `drizzle-kit`
- Relations API for defining table relationships

**PostgreSQL RLS:**
- Enable RLS on tenant-scoped tables
- Create policies that check `tenant_id = current_setting('app.tenant_id')::uuid`
- Always set tenant context before tenant-scoped queries

### References

- `_bmad-output/planning-artifacts/epics.md` (Story 1.2)
- `_bmad-output/planning-artifacts/architecture.md` (Auth & Security, Multi-tenancy)
- `_bmad-output/project-context.md` (Critical Implementation Rules)
- `_bmad-output/implementation-artifacts/1-1-set-up-initial-project-from-starter-template-create-t3-app.md`
- Better Auth documentation: https://www.better-auth.com/
- Drizzle ORM documentation: https://orm.drizzle.team/

### Project Context Reference

**Critical Rules from project-context.md:**
- Better Auth `>= 1.2.10` is mandatory
- Bun is package manager (never switch without explicit decision)
- DB uses `snake_case`, API/JSON uses `camelCase`
- Never access tenant-scoped tables without setting RLS context
- Atomic transactions for multi-table operations
- Server-side authorization is authoritative
- Never log secrets/PII
- Use structured JSON logs only (pino)

## Dev Agent Record

### Agent Model Used

Kimi-K2.5 (via OpenCode)

### Debug Log References

- Initial project structure analysis completed
- Database schema design and implementation
- Better Auth configuration updates
- tRPC router implementation
- UI component development with React Hook Form
- Test framework setup (Vitest) and test implementation
- Build verification successful

### Completion Notes List

1. **Better Auth Configuration**: Updated configuration with secure cookie settings (httpOnly, secure in production, sameSite: lax), session expiration (7 days), and secret validation. Added support for custom user fields (defaultTenantId).

2. **Database Schema**: Created tenants table with UUID PK, tenant_memberships junction table with role enum (Admin/Manager/Operator), and integrated with existing Better Auth user table. RLS policies enabled on all tenant-scoped tables.

3. **Sign-up API**: Implemented atomic transaction in auth.signUp mutation that creates tenant → user → membership in a single transaction. Proper error handling with TRPCError for different failure scenarios.

4. **Sign-up UI**: Created complete sign-up form with email, password, confirm password, and organization name fields. Client-side validation using react-hook-form and zod. Loading states and error messages implemented.

5. **RLS Context Helper**: Implemented setTenantContext, clearTenantContext, and getTenantContext functions for managing PostgreSQL RLS context per request.

6. **Tests**: Created 12 unit tests for validation logic (password, email, sign-up schema) and 8 integration tests for tenant management and RLS policies. All 20 tests passing.

7. **Type Safety**: All code passes TypeScript type checking with no errors. Build completes successfully.

### File List

**New Files Created:**
- `apps/web/src/server/db/schema/tenants.ts` - Tenant and membership schemas with RLS
- `apps/web/src/server/db/schema/index.ts` - Schema exports
- `apps/web/src/server/db/rls.ts` - RLS context helper functions
- `apps/web/src/schemas/auth.ts` - Validation schemas (signUpSchema, passwordSchema)
- `apps/web/src/server/api/routers/auth.ts` - Auth tRPC router with signUp mutation
- `apps/web/src/features/auth/components/sign-up-form.tsx` - Sign-up form component
- `apps/web/src/app/(auth)/signup/page.tsx` - Sign-up page
- `apps/web/src/app/(auth)/layout.tsx` - Auth layout
- `apps/web/src/app/dashboard/page.tsx` - Dashboard page (post-signup redirect)
- `apps/web/drizzle/migrations/0001_tenants_users_memberships.sql` - Database migration
- `apps/web/vitest.config.ts` - Vitest configuration
- `apps/web/tests/setup.ts` - Test setup
- `apps/web/tests/helpers/database.ts` - Test utilities
- `apps/web/tests/unit/auth/validation.test.ts` - Unit tests for validation
- `apps/web/tests/integration/tenant-management.test.ts` - Integration tests

**Modified Files:**
- `apps/web/src/server/better-auth/config.ts` - Added secure cookie config and session settings
- `apps/web/src/server/db/schema.ts` - Added tenants and tenant_memberships tables with relations
- `apps/web/src/server/api/root.ts` - Added auth router
- `apps/web/src/lib/env.ts` - Updated BETTER_AUTH_SECRET validation
- `apps/web/package.json` - Added test scripts and testing dependencies
- `apps/web/.env` - Updated DATABASE_URL for local development
- `apps/web/.env.example` - Documented environment variables
- `_bmad-output/implementation-artifacts/sprint-status.yaml` - Updated story status to in-progress/review

