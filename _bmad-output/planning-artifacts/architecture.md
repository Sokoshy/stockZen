---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/product-brief-gestionnaire-stock-2026-02-01.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/planning-artifacts/research/technical-inventory-management-small-merchants-bakeries-restaurants-research-2026-02-01.md
  - _bmad-output/planning-artifacts/research/domain-inventory-management-small-merchants-bakeries-restaurants-research-2026-02-01.md
  - _bmad-output/planning-artifacts/research/market-inventory-management-small-merchants-bakeries-restaurants-research-2026-02-01.md
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-02-02T20:01:17Z'
project_name: 'gestionnaire-stock'
user_name: 'Sokoshy'
date: '2026-02-02T17:04:15Z'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
The PRD defines 39 functional requirements (FR1–FR39) spanning:
- Product & stock management: product CRUD, stock movements (in/out), automatic stock calculation, per-product movement history, and 3-level thresholds.
- Intelligent alerts: threshold-triggered alerts, visual criticality (R/O/G), email notifications for critical alerts, alert triage (handled/ignored), and account-level default thresholds.
- Authentication & RBAC: account creation/login/password reset, user invites, roles (Admin/Manager/Operator), feature access control, and sensitive data masking (operators cannot see purchase prices).
- Offline-first: full offline operation, local persistence, automatic sync, visible sync status, and conflict handling (“last modified wins”).
- Dashboard & visualization: stock overview, prioritized alert list, basic stats, and PMI indicator.
- Multi-tenancy: strict account isolation and plan limit enforcement.
- Subscription & billing: plan visibility, upgrade/downgrade, plan restrictions by tier, and monthly invoices.
- Import/migration: CSV import with validation and error reporting.

**Non-Functional Requirements:**
Key NFR drivers include:
- Performance: core actions < 2s (p95), dashboard < 3s on 3G, sync of 100 movements < 10s.
- Client constraints: smartphone support (min 2GB RAM), installable PWA, app size < 50MB.
- Security & privacy: TLS 1.3+, AES-256 at rest, bcrypt (cost >= 12), optional MFA for Enterprise, session timeout, strict tenant isolation, audit logs for sensitive actions, GDPR requirements (erasure/portability).
- Reliability: daily backups with 30-day retention, availability targets (99.5% baseline; 99.9% SLA for Enterprise) and support expectations.
- Scalability: support 1000+ concurrent accounts (MVP) with growth to 10,000+ accounts and higher product volumes; horizontal scaling capability.

**Scale & Complexity:**
- Primary domain: full-stack SaaS (web/PWA + backend + data synchronization).
- Complexity level: high (offline-first sync + multi-tenant isolation + security/compliance + billing/quotas).
- Estimated architectural components: ~8–12 major components (auth/identity, tenant isolation, product catalog, inventory ledger, alerting, sync/conflict handling, billing/plan enforcement, dashboard/reporting, audit/logging, import pipeline).

### Technical Constraints & Dependencies

- Offline-first operation is a hard requirement (local persistence, sync status visibility, conflict strategy).
- PWA constraints (bundle size, mobile performance) shape client architecture and data access patterns.
- Strict multi-tenant isolation and plan limit enforcement must be systemic (not “best effort”).
- Security/compliance constraints (encryption in transit/at rest, audit logs, GDPR workflows, backups/retention) are core architectural drivers.
- Subscription, invoicing, and plan enforcement imply integration with a billing/payment provider (to be confirmed).

### Cross-Cutting Concerns Identified

- Offline sync + conflict resolution touches nearly every write path.
- Multi-tenant isolation impacts data model, authorization, query scoping, and testing.
- RBAC + sensitive data masking affects API responses, UI rendering, and auditability.
- Audit logging and compliance requirements affect authentication, inventory mutations, and administrative actions.
- Performance budgets (especially on mobile + 3G) require careful payload sizing, caching, and incremental loading.
- Accessibility (WCAG-oriented) impacts component selection, navigation, and interaction patterns across the UI.

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web application (Next.js) with PWA/offline-first requirements, multi-tenant SaaS backend concerns (RBAC, billing, audit/compliance), and a Postgres data store.

### Starter Options Considered

**Option A - Create T3 App (recommended baseline)**

- Init: `bun create t3-app@latest apps/web`
- What it gives us:
  - Next.js with TypeScript-first defaults
  - A production-leaning baseline that scales well for SaaS needs (auth, DB access, API patterns)
- What it does not solve by itself:
  - PWA/offline-first service worker + local persistence + sync/conflict strategy (we will add explicitly)

**Option B - create-next-app + manual wiring**

- Init: `bun create next-app@latest apps/web`
- What it gives us:
  - Clean minimal Next.js baseline
- Trade-off:
  - More manual setup to reach a similar product-grade baseline (auth, ORM, API layering, billing, etc.)

### Selected Starter: Create T3 App

**Rationale for Selection:**

- Best fit for an intermediate team building a multi-tenant SaaS with strong cross-cutting concerns (auth/RBAC, DB, billing) while keeping consistent conventions and type-safety.
- Supports Bun for scaffolding and dependency management (no npm/pnpm requirement).

**Initialization Command:**

```bash
bun create t3-app@latest apps/web
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**

- TypeScript
- Bun as package manager and (optionally) runtime in dev scripts

**Frontend:**

- Next.js (App Router)
- Tailwind CSS (recommended)

**Backend/API:**

- Type-safe API layer (tRPC is the typical T3 choice) or Next.js Route Handlers (final choice pending)

**Data:**

- PostgreSQL
- ORM (Prisma is the typical T3 choice)

**Auth:**

- Self-hosted auth via library approach (no external auth service; concrete library pending)

**Billing:**

- Stripe integration planned (not scaffolded by default)

**Known follow-ups (driven by requirements):**

- Add PWA/offline-first: service worker, local DB (IndexedDB), sync + conflict policy, and background sync strategy.
- Formalize tenant isolation + RBAC enforcement boundaries across DB schema, API, and UI.
- Add audit logging + GDPR workflows and data retention/backup requirements.

## Core Architectural Decisions

### Data Architecture

**Database (PostgreSQL):**

- Selected: PostgreSQL 18 (current minor: 18.1).
- Rationale: modern Postgres baseline; we will stay on current minor releases.

**Multi-tenancy & Isolation:**

- Selected: single shared PostgreSQL database + `tenant_id` on tenant-scoped tables + Postgres Row-Level Security (RLS).
- Rationale: fail-safe isolation at the database layer to prevent accidental cross-tenant reads/writes even if application code has a bug.
- Enforcement approach:
  - All tenant-scoped tables include `tenant_id` (UUID).
  - RLS policies enforce `tenant_id = current_setting('app.tenant_id')::uuid`.
  - The API layer must set `app.tenant_id` per request/transaction (e.g., `SET LOCAL app.tenant_id = '...'`) after authentication.

**Inventory Data Model (Audit-friendly / Offline-ready):**

- Selected: append-only inventory ledger.
- Core tables:
  - `products` (tenant-scoped)
  - `stock_movements` (tenant-scoped, append-only): records entries/exits/adjustments with immutable history
- Derived state:
  - `current_stock` is derived (query/view/materialized view/denormalized column) from `stock_movements`.
- Rationale: natural audit trail, supports movement history, supports offline sync and conflict handling, and enables recalculation.

**Offline Conflict Strategy (PRD FR26):**

- Selected: “last modified wins” using server-side timestamps as source of truth.
- Implications:
  - Keep `serverUpdatedAt` / `serverVersion` as authoritative.
  - Store optional `clientUpdatedAt` for debugging/UX display, but do not use it for arbitration.
  - Use idempotency keys for sync replays to avoid duplicate movement inserts.

**ORM / Migrations / Validation:**

- ORM: Drizzle ORM (stable 0.44.x line).
- Migrations: drizzle-kit (SQL migrations checked into repo).
- Validation: Zod + `drizzle-zod` for generating request/DTO schemas from table definitions.
- Rationale: keep SQL close, reduce runtime magic, and share types across layers.

**Caching:**

- MVP decision: no Redis. Use Postgres indexing + query tuning + HTTP/Next caching where appropriate.
- Revisit when load/perf metrics require it.

### Authentication & Security

**Authentication Library:**

- Selected: Better Auth.
- Version policy: pin to a maintained 1.x version and enforce `>= 1.2.10` due to a fixed open-redirect vulnerability in earlier versions.

**Session Strategy:**

- Selected: cookie-based sessions backed by a database session table (no stateless JWT for primary auth).
- Cookie requirements:
  - httpOnly + secure in production.
  - Signed using server secret.
- Session storage:
  - Use Postgres as session store (session table includes `expiresAt`, and tracks user agent / IP address where available).

**Tenant Association & RLS Interaction:**

- Tenancy model: users are associated with a tenant (organization/account).
- Request lifecycle:
  1) Authenticate the user via session.
  2) Resolve `tenant_id` (from session/user membership).
  3) Set `SET LOCAL app.tenant_id = '<tenant-uuid>'` for the DB transaction.
  4) All tenant-scoped queries rely on RLS + `tenant_id` scoping.
- Note: auth/session tables may be tenant-scoped (include `tenant_id`) or joined via `user -> tenant membership` depending on Better Auth schema integration.

**Authorization (RBAC):**

- Selected: centralized authorization policy/ability layer.
- Roles: Admin / Manager / Operator (per PRD).
- Enforcement rules:
  - All server-side mutations and sensitive reads are guarded by the policy layer.
  - UI uses the same permission model for navigation and feature gating, but server remains authoritative.
- Specific constraint:
  - Operators must never see purchase prices (enforced at API serialization + query selection).

**Security Controls (NFR-driven):**

- Transport security: TLS 1.3+ end-to-end.
- Session controls: 30-minute inactivity timeout.
- Audit logging: record all sensitive actions (logins, stock modifications, role changes, billing-relevant actions).
- Rate limiting: apply to auth endpoints (login, password reset, invite flows) and any sync endpoints.

**Encryption at Rest:**

- Selected: rely on infrastructure-level encryption at rest (disk/volume encryption) for Postgres.
- Additional application-level encryption:
  - Only for select secrets if/when stored (e.g., 2FA secret storage is handled by the Better Auth 2FA plugin).

**MFA (Enterprise):**

- Selected: TOTP-based 2FA via Better Auth Two Factor plugin.
- Requirements:
  - Support backup codes and trusted devices.
  - Enforce “fresh” authentication for sensitive actions if supported by the auth layer.

### API & Communication Patterns

**Primary API Style:**

- Selected: tRPC (v11).
- Scope: primary API for the web app (queries/mutations, internal typed contracts).

**Offline Sync Endpoint (FR24/25/26):**

- Selected: dedicated REST endpoint(s) implemented as Next.js Route Handler(s), e.g. `POST /api/sync`.
- Payload: batch of client operations (primarily inventory movements) with idempotency keys.
- Behavior:
  - Server is source of truth for ordering and conflict resolution (LWW using server timestamps).
  - Endpoint returns per-item statuses (applied/duplicate/rejected) and the server "checkpoint" for subsequent syncs.
- Rationale: sync is a specialized batch/stream-like workflow that benefits from explicit HTTP semantics and strict rate limiting.

**API Documentation:**

- Selected: tRPC-only documentation (no OpenAPI generation).
- Approach:
  - Treat tRPC router as the contract.
  - Maintain a small human-readable "API notes" section for sync payload shape, error codes, and idempotency rules.

**Rate Limiting:**

- Selected: global rate limiting, with stricter limits on authentication endpoints and on `/api/sync`.
- Rationale: protects against abuse and reduces sync/billing attack surface.

**Error Handling Standard:**

- Selected: tRPC default error format for tRPC endpoints.
- REST `/api/sync` errors:
  - Use standard HTTP status codes.
  - Return a simple JSON error object `{ code, message }` for non-200 responses (aligned with the "tRPC-style" error philosophy, not RFC7807).

### Frontend Architecture

**Data Fetching / Server State:**

- Selected: tRPC client integrated with TanStack Query (`@tanstack/react-query` v5).
- Pattern: keep server-state in TanStack Query; use React local state for purely UI concerns.

**Client State Management:**

- Selected: no additional global store (no Zustand) for MVP.
- Rationale: reduce complexity; rely on TanStack Query cache + colocated component state.

**Forms & Validation:**

- Selected: React Hook Form + Zod.
- Pattern:
  - Zod schemas as the source of truth for validation.
  - Use Zod inference for form types and API DTO alignment.
- Compatibility note: pin versions for `zod` + `@hookform/resolvers` to avoid known integration mismatches.

**UI Component System:**

- Selected: shadcn/ui + Tailwind + Radix primitives (via shadcn).
- Rationale: high-quality accessible primitives, fast iteration, full control over component code.

**Offline-First Client Storage:**

- Selected: IndexedDB with Dexie.
- Local data model:
  - Maintain an outbox of offline operations (e.g., stock movements) with idempotency keys.
  - Maintain lightweight local read models needed for offline UX.
- Sync trigger points:
  - Background sync when online, plus manual "sync now" action and visible sync status.

**PWA / Service Worker:**

- Selected: Serwist (`@serwist/next`).
- Goals:
  - Offline navigation + asset caching.
  - API caching only where safe; inventory writes always go through the outbox.

**Accessibility:**

- Selected: Radix primitives (via shadcn) + automated a11y checks using axe tooling.
- Baseline: keyboard navigation, ARIA correctness, focus management, color contrast, and screen-reader compatibility.

### Infrastructure & Deployment

**Deployment Model:**

- Selected: Docker-first.
- Rationale: portable across providers; deterministic builds; matches Fly.io deployment model.

**Hosting:**

- Selected: Fly.io (Fly Machines).
- Approach:
  - Deploy the Next.js app as a Docker image.
  - Use Next.js `output: \"standalone\"` to reduce image size and runtime footprint.
  - Store runtime secrets (e.g., `DATABASE_URL`) in provider secrets; avoid baking secrets into images.

**Environments:**

- MVP baseline: separate Fly apps for `staging` and `production`.
- Configuration via environment variables + secrets; no config committed for secrets.

**Observability (phased):**

- Now (MVP):
  - JSON structured logs to stdout (captured by Fly logs).
  - Sentry for client + server error monitoring and basic performance visibility.
- Later:
  - OpenTelemetry instrumentation (JS SDK 2.x) with an exporter/collector once runtime/infrastructure is finalized.

**Logging:**

- Selected: pino (current: 9.9.4) with JSON output.
- Pattern:
  - Correlation fields: `requestId`, `tenantId`, `userId` (when available), route/method, latency.
  - Redaction: ensure sensitive fields are removed (tokens, passwords, 2FA secrets).

**Error Monitoring:**

- Selected: Sentry for Next.js (current: 10.8.0).
- Setup via Sentry wizard and environment-based DSN configuration.
- Ensure PII scrubbing and sampling configuration for performance traces.

**Backups (NFR-S9):**

- Selected: provider-managed backups + additional logical backups.
- Provider backups:
  - Enable and manage Fly Postgres backups (snapshot/WAL-based flows per Fly tooling).
- Logical backups:
  - Scheduled `pg_dump` exports (e.g., daily) stored outside the primary DB provider (object storage).
- Restore practice:
  - Document a restore runbook and periodically verify restore on staging.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

Critical conflict points identified: naming, structure, formats, communication, and cross-cutting process patterns (offline sync, RBAC, logging). The following rules are intentionally explicit to prevent AI agents from introducing incompatible conventions.

### Naming Patterns

**Database Naming Conventions:**

- Tables: `snake_case`, plural (e.g., `products`, `stock_movements`, `audit_events`).
- Columns: `snake_case` (e.g., `tenant_id`, `created_at`, `updated_at`).
- Primary keys: `id` (UUID) on tenant-scoped tables unless explicitly decided otherwise.
- Foreign keys: `<entity>_id` (e.g., `product_id`, `user_id`).

**API & JSON Naming Conventions:**

- JSON fields: `camelCase` everywhere (e.g., `tenantId`, `createdAt`, `purchasePrice`).
- API payloads and responses must never use `snake_case` keys.

**Code Naming Conventions:**

- TypeScript: `camelCase` for variables/functions, `PascalCase` for components/types.
- Files: `kebab-case` for React components and feature modules (e.g., `stock-movement-form.tsx`).

### Structure Patterns

**Project Organization (feature-first):**

- Features live in `src/features/<feature>/...` (or `apps/web/src/features/<feature>/...` if monorepo).
- Shared UI components live in `src/components/...`.
- Shared utilities live in `src/lib/...`.
- Zod schemas live in `src/schemas/...` and are imported by both tRPC routers and forms.

### Format Patterns

**Date/Time Format:**

- All API-visible date/time values are ISO 8601 strings in UTC (e.g., `2026-02-02T17:04:15Z`).
- Avoid numeric timestamps in JSON payloads.

**tRPC Response Format:**

- No response wrappers (no `{ data: ... }` envelope). Return domain objects directly.
- Use tRPC error format for tRPC procedures.

**REST `/api/sync` Format:**

- Success response shape:
  - `{ checkpoint, results: [...] }`
- Error response shape (non-200):
  - `{ code, message }`

### Communication Patterns (Offline Sync)

**Idempotency & De-duplication:**

- Every offline operation includes:
  - `operationId` in the payload.
  - `Idempotency-Key` header (same value as `operationId`).
- Server deduplication key: `(tenant_id, operation_id)` to prevent duplicate inserts on retries.

**Outbox Pattern (Client):**

- All offline writes are stored in Dexie outbox tables (e.g., `outbox_ops`) before syncing.
- Server writes must not be attempted directly from offline UI flows; they must flow through the outbox + `/api/sync`.

### Process Patterns

**RBAC Enforcement:**

- Server is authoritative.
- Authorization checks must go through a single centralized policy/ability layer.
- UI gating is allowed for UX, but never relied upon for security.

**Logging:**

- Use JSON structured logs (pino) with standard fields:
  - `requestId`, `tenantId`, `userId`, `route`, `durationMs`
- Do not log secrets or PII (redact tokens, passwords, 2FA secrets; minimize user-identifying data).

## Project Structure & Boundaries

### Complete Project Directory Structure

```text
gestionnaire-stock/
├── README.md
├── .gitignore
├── .env.example
├── .github/
│   └── workflows/
│       └── ci.yml
├── docker/
│   ├── Dockerfile.web
│   └── docker-compose.dev.yml
├── fly/
│   ├── fly.staging.toml
│   └── fly.production.toml
└── apps/
    └── web/
        ├── package.json
        ├── bun.lock
        ├── tsconfig.json
        ├── next.config.ts
        ├── tailwind.config.ts
        ├── postcss.config.js
        ├── drizzle.config.ts
        ├── public/
        │   └── icons/
        ├── drizzle/
        │   └── migrations/                 # includes schema + RLS SQL
        ├── src/
        │   ├── app/
        │   │   ├── globals.css
        │   │   ├── layout.tsx
        │   │   ├── page.tsx
        │   │   ├── manifest.ts
        │   │   ├── (auth)/
        │   │   │   └── login/page.tsx
        │   │   ├── (app)/
        │   │   │   ├── dashboard/page.tsx
        │   │   │   ├── products/page.tsx
        │   │   │   ├── alerts/page.tsx
        │   │   │   ├── settings/page.tsx
        │   │   │   └── billing/page.tsx
        │   │   └── api/
        │   │       ├── trpc/[trpc]/route.ts
        │   │       ├── sync/route.ts        # REST offline sync
        │   │       └── stripe/webhook/route.ts
        │   ├── components/
        │   │   ├── ui/                      # shadcn components
        │   │   ├── forms/
        │   │   └── layout/
        │   ├── features/
        │   │   ├── products/
        │   │   │   ├── components/
        │   │   │   ├── queries/
        │   │   │   └── schemas/
        │   │   ├── inventory/
        │   │   │   ├── components/
        │   │   │   ├── queries/
        │   │   │   └── schemas/
        │   │   ├── alerts/
        │   │   │   ├── components/
        │   │   │   ├── queries/
        │   │   │   └── schemas/
        │   │   ├── offline/
        │   │   │   ├── db/                  # Dexie schema + migrations
        │   │   │   ├── outbox/              # enqueue/retry/dedupe
        │   │   │   ├── sync/                # orchestrate /api/sync + checkpoints
        │   │   │   ├── read-models/          # local projections for UX
        │   │   │   └── components/
        │   │   ├── auth/
        │   │   │   ├── components/
        │   │   │   └── policies/
        │   │   └── billing/
        │   │       ├── components/
        │   │       ├── queries/
        │   │       └── schemas/
        │   ├── lib/
        │   │   ├── env.ts
        │   │   ├── logger.ts
        │   │   └── request-context.ts
        │   ├── schemas/
        │   │   ├── common.ts
        │   │   └── sync.ts
        │   └── server/
        │       ├── api/
        │       │   ├── root.ts
        │       │   └── routers/
        │       │       ├── products.ts
        │       │       ├── inventory.ts
        │       │       ├── alerts.ts
        │       │       ├── billing.ts
        │       │       └── users.ts
        │       ├── auth/
        │       │   ├── better-auth.ts
        │       │   └── rbac-policy.ts
        │       ├── db/
        │       │   ├── client.ts
        │       │   ├── rls.ts               # SET LOCAL app.tenant_id helper
        │       │   └── schema/
        │       │       ├── products.ts
        │       │       ├── stock-movements.ts
        │       │       ├── tenants.ts
        │       │       ├── users.ts
        │       │       └── audit-events.ts
        │       ├── services/
        │       │   ├── inventory-service.ts
        │       │   ├── alert-service.ts
        │       │   ├── sync-service.ts
        │       │   └── audit-service.ts
        │       └── stripe/
        │           ├── client.ts
        │           └── webhook-handler.ts
        └── tests/
            ├── fixtures/
            ├── helpers/
            ├── unit/
            ├── integration/
            │   └── rls/
            └── e2e/
                └── offline-sync/
```

### Architectural Boundaries

**API Boundaries:**
- tRPC: internal web-app contract only (`src/server/api/**` + `src/app/api/trpc/**`).
- REST: offline sync only (`src/app/api/sync/route.ts`) with `{ checkpoint, results }`.
- Stripe: webhook ingress only (`src/app/api/stripe/webhook/route.ts`).

**Component Boundaries:**
- UI components: `src/components/ui` (shadcn); feature components live under `src/features/<feature>/components`.
- Feature modules own their schemas, UI, and client queries. Cross-feature reuse is forbidden unless routed through shared layers (`src/components`, `src/lib`, `src/schemas`).
- Client code must not import `src/server/**` (enforce via lint rules).

**Service Boundaries:**
- Business logic lives in `src/server/services/**`.
- Routers and route handlers are thin: validate input -> call service -> return DTO.

**Data Boundaries:**
- DB schema only in `src/server/db/schema/**` (Drizzle).
- Tenant-scoped DB access must always set RLS context via `src/server/db/rls.ts`.
- RLS policies are applied via `drizzle/migrations/` so they are versioned and reproducible.

### Requirements to Structure Mapping

- Product & Stock Management → `src/features/products`, `src/features/inventory`, `src/server/api/routers/products.ts`, `src/server/api/routers/inventory.ts`, `src/server/services/inventory-service.ts`
- Intelligent Alerts → `src/features/alerts`, `src/server/api/routers/alerts.ts`, `src/server/services/alert-service.ts`
- User Management & Authentication → `src/features/auth`, `src/server/auth/**`, `src/server/api/routers/users.ts`
- Offline-First Architecture → `src/features/offline/**`, `src/app/api/sync/route.ts`, `src/server/services/sync-service.ts`
- Dashboard & Visualization → `src/app/(app)/dashboard/page.tsx` + widgets in feature components
- Multi-Tenancy & Isolation → `src/server/db/rls.ts`, `drizzle/migrations/*rls*`, tenant schema in `src/server/db/schema/tenants.ts`
- Subscription & Billing → `src/features/billing`, `src/server/stripe/**`, `src/app/api/stripe/webhook/route.ts`
- Import & Migration → `src/features/products` + dedicated import service under `src/server/services/`

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**

- Next.js full-stack + tRPC is coherent for the primary internal API contract.
- Postgres 18 + multi-tenant `tenant_id` + RLS aligns with the "no tenant leak" requirement.
- Drizzle ORM fits the "SQL close to the metal" approach and works with Postgres + migrations.
- Offline-first choices are mutually reinforcing: Dexie outbox + REST `/api/sync` + server-authoritative LWW.
- Fly.io + Docker-first matches the chosen deployment model and supports the availability/observability baseline.

**Pattern Consistency:**

- Naming is consistent: DB snake_case vs API/JSON camelCase, ISO 8601 UTC for dates, and explicit sync response shapes.
- Authorization enforcement is consistent: centralized server-side policy layer + UI gating is non-authoritative.
- Logging and auditing are aligned with security/compliance drivers.

**Structure Alignment:**

- The project tree supports all decisions: clear placement for tRPC routes, REST sync route, Stripe webhook ingress, offline module, RLS helper, and server services.
- Boundaries are explicitly stated:
  - No cross-feature imports (unless via shared layers).
  - No client imports from `src/server/**`.
  - RLS policies applied via versioned SQL migrations only.

### Requirements Coverage Validation ✅ (with noted gaps)

**Functional Requirements Coverage:**

- Product & stock management (ledger, history, thresholds): supported by `stock_movements` model + inventory services/routers.
- Alerts (R/Y/G + dashboard): supported structurally; alert generation and email delivery require an email-sending decision (see gaps).
- Auth & RBAC (Admin/Manager/Operator + price masking): supported by Better Auth + centralized policy enforcement + API serialization rules.
- Offline-first (store locally, sync, status, conflict LWW): supported by Dexie outbox + `/api/sync` + checkpoints + LWW policy.
- Multi-tenancy & plan limits: supported by RLS and planned plan enforcement; concrete enforcement mechanism requires a decision (see gaps).
- Billing & invoices: Stripe integration is planned and webhook ingress is placed; invoice ownership model requires a decision (see gaps).
- CSV import: supported by structure (dedicated import service + schemas), but needs explicit import pipeline rules (see gaps).

**Non-Functional Requirements Coverage:**

- Performance budgets: partially addressed (no Redis MVP, DB indexing + caching strategy mentioned) but needs explicit "performance guardrails" to avoid regressions (see gaps).
- Security: TLS, encryption at rest (infra), session timeout, audit logging, rate limiting, MFA (TOTP) are covered.
- Compliance: GDPR mentioned, but concrete delete/export workflows should be pinned to avoid drift (see gaps).
- Availability & reliability: backups covered (provider + pg_dump) and Fly deploy model chosen; HA/uptime tactics can be refined (see gaps).

### Implementation Readiness Validation ✅ (with noted gaps)

**Decision Completeness:**

- Core tech decisions are documented.
- A few "service provider / tooling" decisions are missing and could lead to divergent implementations.

**Structure Completeness:**

- Tree is specific and maps FR categories to concrete directories.
- Tests layout is present, but the test toolchain is not chosen yet.

**Pattern Completeness:**

- Most conflict points are addressed.
- Two areas still need explicit conventions: import-boundary enforcement tooling, and sync/idempotency contract details.

### Gap Analysis Results

**Critical Gaps (should be decided before building the MVP features):**

1) Email delivery for critical alerts (FR11):
   - Choose provider/library + delivery architecture (queue vs direct send) + templates location.
2) Subscription plan enforcement model (FR33, FR36):
   - Decide "source of truth" for plan limits (Stripe subscription vs local snapshot) and enforcement points (API middleware vs per-service checks).

**Important Gaps (strongly recommended to decide early to avoid agent divergence):**

1) Test stack:
   - Choose unit/integration runner and e2e framework; define where to add fixtures, RLS anti-leak tests, and offline-sync e2e.
2) Sync contract details:
   - Define exact `/api/sync` payload schema, checkpoint semantics, retry/backoff rules, and per-item error codes.
3) Stripe billing specifics:
   - Decide: Stripe Billing manages invoices vs app-generated invoices; define webhook event list and idempotency.
4) GDPR workflows:
   - Define data export + deletion boundaries (tenant deletion, user deletion, audit log retention rules).
5) Performance guardrails:
   - Define budgets (bundle size strategy, query limits, pagination defaults, index policy) and how to monitor.

**Nice-to-Have Gaps (can be deferred):**

- OpenTelemetry rollout plan (given Bun/Next runtime considerations).
- Multi-region strategy / HA DB strategy for higher SLA tiers.
- Import pipeline hardening (large CSV streaming, background jobs).

### Validation Issues Addressed

- Confirmed: no cross-feature imports (enforced) and RLS policies applied only via versioned migrations.
- Clarification needed: Starter template section references Prisma as typical; final decision is Drizzle and must be treated as authoritative.

### Architecture Completeness Checklist

- [x] Project context analyzed (FRs/NFRs, offline-first, multi-tenant, billing)
- [x] Core architectural decisions documented
- [x] Implementation patterns defined to prevent agent conflicts
- [x] Project structure and boundaries defined and mapped to requirements
- [ ] Critical gaps resolved (email provider, plan enforcement)
- [ ] Important gaps resolved (test stack, sync contract details, Stripe specifics, GDPR workflows)
