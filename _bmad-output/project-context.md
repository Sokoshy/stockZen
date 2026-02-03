---
project_name: 'gestionnaire-stock'
user_name: 'Sokoshy'
date: '2026-02-03T18:40:06+01:00'
sections_completed:
  - technology_stack
  - language_specific_rules
  - framework_specific_rules
  - testing_rules
  - code_quality_style_rules
  - development_workflow_rules
  - critical_dont_miss_rules
  - usage_guidelines
status: 'complete'
rule_count: 49
optimized_for_llm: true
existing_patterns_found: 9
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

Source of truth: `_bmad-output/planning-artifacts/architecture.md`.

- Product type: full-stack SaaS web app (Next.js) with PWA/offline-first requirements
- Language: TypeScript
- Package manager: Bun (commit `bun.lock`; do not switch package managers without an explicit decision)
- Runtime policy: Bun is the package manager; production runtime (Node vs Bun) is not yet finalized — keep server code compatible with Node.js conventions and avoid Bun-only runtime APIs unless explicitly decided
- Frontend: Next.js (App Router), Tailwind CSS, shadcn/ui components
- API: tRPC (internal contract) + Next.js Route Handlers (REST for `/api/sync`, plus Stripe webhook ingress)
- Database: PostgreSQL 18.1 (if this target changes, update Docker/Fly configs + docs in the architecture artifacts)
- ORM/migrations: Drizzle ORM (0.44.x line), drizzle-kit (SQL migrations checked into repo)
- Validation: Zod + `drizzle-zod`
- Auth: Better Auth (pin a maintained 1.x; enforce `>= 1.2.10` — do not downgrade/loosen)
- Offline local persistence: IndexedDB via Dexie (outbox + projections)
- Logging: pino (structured JSON logs)
- Billing: Stripe (webhooks; billing integration planned)
- Deployment baseline: Docker-first; Fly.io (staging + production)
- Upgrade discipline: major upgrades (Next.js / Drizzle / Better Auth) must be isolated to a dedicated PR and validated against auth flows, `/api/sync`, and Stripe webhook ingress

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

- Naming: `camelCase` for vars/functions, `PascalCase` for components/types; files `kebab-case` (e.g., `stock-movement-form.tsx`).
- Boundary mapping: DB uses `snake_case`; API/JSON uses `camelCase` only (never expose `snake_case` keys).
- Schemas: Zod schemas live in `src/schemas/**` and must be shared by both server procedures/handlers and client forms (avoid duplicate validation logic).
- Dates: all API-visible datetime values are ISO 8601 UTC strings in UTC (e.g., `2026-02-02T17:04:15Z`); avoid numeric timestamps in JSON.

### Framework-Specific Rules (Next.js / API Boundaries)

- API boundaries:
  - tRPC is internal app contract only (`src/server/api/**` + `src/app/api/trpc/**`).
  - REST is offline sync only (`src/app/api/sync/route.ts`) and must use `{ checkpoint, results }` (errors: `{ code, message }`). Treat this as a stable contract for the offline client.
  - Stripe is webhook ingress only (`src/app/api/stripe/webhook/route.ts`); keep the handler thin (verify signature + parse + delegate to service code), no business logic inline.
- Component boundaries:
  - UI primitives in `src/components/ui` (shadcn); feature UI in `src/features/<feature>/components`.
  - No cross-feature imports unless routed through shared layers (`src/components`, `src/lib`, `src/schemas`).
  - Client code must never import `src/server/**` (enforce via lint).
- Service boundaries:
  - Business logic lives in `src/server/services/**`.
  - Route handlers and routers stay thin: validate input -> call service -> return DTO.

### Testing Rules

- Keep the intended test layout: `tests/unit/**`, `tests/integration/**`, `tests/e2e/**` with shared `tests/fixtures/**` + `tests/helpers/**`.
- Prioritize risk-based coverage:
  - RLS anti-tenant-leak integration tests (must prove “no cross-tenant read/write”).
  - Offline sync tests (contract + idempotency + retry/dedupe) as integration/e2e.
  - Stripe webhook tests: signature verification + handler delegates to service code (no business logic in route handler).
- Any future test stack selection must support: DB-backed integration tests and deterministic e2e for offline sync.

### Code Quality & Style Rules

- UI stack is shadcn/ui + Tailwind + Radix primitives; prefer these primitives over ad-hoc custom components for consistency and a11y.
- Accessibility: include automated a11y checks using axe tooling; don’t ship new UI flows without a11y coverage.
- Import boundaries must be enforceable (lint/tooling): prevent client importing `src/server/**` and prevent cross-feature imports (except via `src/components`, `src/lib`, `src/schemas`).
- Logging: structured JSON logs only; never log secrets/PII (redact tokens/passwords/2FA secrets).
- Environment variables: access via `src/lib/env.ts` (no scattered `process.env.*` reads).
- Type safety: avoid `any`; avoid `console.log` in committed code (use structured logger).

### Development Workflow Rules

- Keep changes scoped and atomic; avoid mega-PRs mixing unrelated concerns.
- Major upgrades (Next.js / Drizzle / Better Auth) require a dedicated PR + targeted validation (auth flows, `/api/sync`, Stripe webhook ingress).
- Secrets: never commit secrets; use env vars + secret manager (per deployment platform).
- Migrations: schema/RLS changes only via versioned SQL migrations; no manual production edits.

### Critical Don’t‑Miss Rules

- Tenancy/RLS: never access tenant-scoped tables without setting RLS context (`SET LOCAL app.tenant_id`) via the dedicated helper; do not rely on ad-hoc `WHERE tenant_id = ...` as a substitute.
- Sensitive data: Operators must never see purchase prices — enforce at DB selection + API serialization (UI gating is non-authoritative).
- Inventory ledger: `stock_movements` is append-only for audit/offline correctness; do not update/delete movements as a “fix”.
- Offline conflict policy: server timestamps/versions are authoritative (LWW); do not arbitrate using client clocks.
- Offline sync: client must not write directly to server from offline flows; all writes go through outbox + `/api/sync`.
- Idempotency: every sync op includes `operationId` and `Idempotency-Key` (same value); server must dedupe on `(tenant_id, operation_id)`.
- Rate limiting: apply stricter limits to auth endpoints and `/api/sync`.
- Observability hygiene: never send secrets/PII to logs/Sentry; redact tokens/passwords/2FA secrets; avoid capturing raw request bodies for auth/sync.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code.
- Follow all rules exactly as documented; when in doubt, choose the more restrictive option.
- If a new pattern is needed, update this file alongside the change (avoid silent “exceptions”).

**For Humans:**

- Keep this file lean and focused on agent needs.
- Update when the tech stack, contracts (`/api/sync`), or boundaries change.
- Review quarterly and remove rules that become obvious or obsolete.

Last Updated: 2026-02-03T18:40:06+01:00
