# StockZen — Context Map

This file is a top-level entry point for navigating StockZen. It
complements the per-feature `CONTEXT.md` files with a project-wide
map: what each feature does, where the code lives, and what the
authoritative sources of truth are.

## What is StockZen

StockZen is a multi-tenant inventory management web app. Tenants
create products, log stock movements (entries / exits), and see
critical stock alerts. The admin app is a Next.js 15 app with an
offline-first sync layer that lets the user keep working without
connectivity and drains mutations to a Postgres server when the
network is back.

## Repository layout

```
stockZen/
├── apps/web/                       ← the only application
│   ├── src/
│   │   ├── app/                    ← Next.js app router (routes, layouts)
│   │   ├── features/               ← vertical slices, see "Features" below
│   │   ├── server/                 ← tRPC routers, Drizzle, auth, RLS
│   │   ├── schemas/                ← Zod schemas shared between client and server
│   │   ├── trpc/                   ← tRPC client wiring
│   │   ├── lib/                    ← misc utilities
│   │   ├── components/             ← shared UI primitives
│   │   └── tests/                  ← unit + integration + e2e tests
│   ├── drizzle/                    ← SQL migrations (numbered)
│   ├── drizzle.config.ts
│   ├── playwright.config.ts        ← E2E spec runner
│   ├── vitest.config.ts            ← unit + integration test runner
│   └── package.json
├── _bmad/                          ← planning memory (not runtime)
├── REVIEW-REPORT.md                ← 2026-06-04 review (untracked)
├── architecture-report.md          ← 2026-06-04 architecture review (untracked)
├── CONTEXT-MAP.md                  ← this file
└── …
```

The `apps/web` workspace is the only runtime component. There is no
monorepo orchestration; the package manager is `aube` (a mise-managed
wrapper) and the task runner is `mise` (see `.mise.toml`).

## Features

StockZen is organised as vertical slices under
`apps/web/src/features/`. Each feature owns its components, hooks,
client-side stores, and (where applicable) its tRPC router.

| Feature | Purpose | Key files |
|---|---|---|
| `auth` | Sign-in / sign-up via Better Auth. Session, password reset, "remember me" cookie. | `src/features/auth/`, `src/server/auth.ts` |
| `alerts` | Critical stock alerts dashboard. | `src/features/alerts/`, `src/features/alerts-dashboard/` |
| `billing` | Stripe-backed subscription plans and webhooks. | `src/features/billing/`, `src/server/billing/` |
| `dashboard` | Landing page after sign-in. | `src/features/dashboard/` |
| `inventory` | Stock movements UI (entry / exit). | `src/features/inventory/` |
| `offline` | Outbox, SyncEngine, IndexedDB, offline UI. The most complex feature. | `src/features/offline/`, [`CONTEXT.md`](apps/web/src/features/offline/CONTEXT.md) |
| `products` | Product CRUD, sync status summary, delete dialog. | `src/features/products/` |
| `tenant-thresholds` | Per-tenant low-stock thresholds. | `src/features/tenant-thresholds/` |

## Server architecture

- **Database**: Postgres 16 with Drizzle ORM. Multi-tenant via
  Postgres RLS. The app connects as a non-superuser role
  (`stockzen_app`) with `FORCE ROW LEVEL SECURITY` on every table.
  Tenant context is set per request via
  `set_config('app.tenant_id', …, true)` and consumed by RLS
  policies with `nullif(current_setting('app.tenant_id', true), '')::uuid`.
  See `src/server/db/rls.ts` and migration `0018_app_role_and_rls_hardening.sql`.
- **API**: tRPC v11. Routers live under `src/server/api/routers/` and
  are merged in `src/server/api/root.ts`. The client wraps tRPC with
  TanStack Query via `src/trpc/react.ts`.
- **Auth**: Better Auth (`src/server/auth.ts`). Sessions are stored
  in the `sessions` table. The "remember me" cookie sets a 30-day
  expiry on the cookie only; the Better Auth session expiry is 30
  min and is refreshed on use.
- **Validation**: Zod schemas in `src/schemas/`. Every tRPC
  procedure validates its input against a Zod schema; the same
  schemas are imported on the client for form validation.
- **Background work**: nothing. Sync is the only background-y thing
  and it is per-tab on the client. Cron / scheduled jobs (if any) are
  out of scope for this codebase.

## Client architecture

- **Framework**: Next.js 15 (app router) with React 19. Tailwind 4.
- **Forms**: react-hook-form + `@hookform/resolvers/zod`.
- **State**: TanStack Query for server state, React state for UI
  state. No global state store; the offline sync engine is the only
  long-lived client-side service, and it is a singleton per tenant.
- **Offline**: Dexie (IndexedDB) with a custom v6 schema. See
  [`apps/web/src/features/offline/CONTEXT.md`](apps/web/src/features/offline/CONTEXT.md).
- **UI primitives**: shadcn/ui (Radix under the hood). Custom
  components in `src/components/`.

## Multi-tenant model

Every domain table has a `tenantId` column. RLS is enforced at the
DB level; the app code is a defence-in-depth layer. The
`app.tenant_id` Postgres GUC is set by the tRPC middleware and read
by RLS policies; `clearTenantContext` is a module-private helper,
not exported.

A user can be a member of multiple tenants via
`tenant_memberships`. The active tenant is selected on sign-in and
stored in the session; switching tenants is a sign-out / sign-in
flow today.

## Tests

Three layers:

- **Unit** (`apps/web/tests/unit/`): Vitest. No live DB. Fast. The
  bulk of the offline-sync tests live here (see
  `tests/unit/offline/sync-pipeline/`).
- **Integration** (`apps/web/tests/integration/`): Vitest with a real
  Postgres DB (started by `start-database.sh`). Used for tRPC
  routers, RLS, and Drizzle queries.
- **E2E** (`apps/web/tests/e2e/`): Playwright. The repo's only real
  Playwright spec is `example.spec.ts`; the rest of the directory is
  Vitest-mislabeled and should be migrated. A real
  `/products`-driven Playwright spec is a known gap (see PR #15
  review notes — C8).

Run with `mise run test` (unit + integration) or
`mise run test-e2e` (Playwright).

## Decisions of record (ADRs)

| ID | Title | Status |
|---|---|---|
| 0001 | [permanently_failed lifecycle and one-shot retry](apps/web/src/features/offline/docs/adr/0001-offline-sync-permanently-failed-lifecycle.md) | Accepted, 2026-06-07 |

## Open review threads

- `REVIEW-REPORT.md` (2026-06-04): a top-to-bottom review that
  produced the architecture-report follow-up. Most critical items
  have been addressed in PR #14 (tenant isolation hardening) and
  PR #15 (sync pipeline consolidation). The file is untracked; do
  not commit it without an explicit decision.
- `architecture-report.md` (2026-06-04): companion to
  `REVIEW-REPORT.md`, also untracked. Same caveat.

## Glossary

- **Tenant** — a single customer's organisation. Hard-isolation via
  RLS. Identified by a UUID.
- **Membership** — a row in `tenant_memberships` linking a user to a
  tenant with a role (`owner`, `admin`, `member`).
- **Outbox** — Dexie table that records every local mutation before
  it is sent to the server. See
  [`offline/CONTEXT.md`](apps/web/src/features/offline/CONTEXT.md).
- **SyncEngine** — the per-tenant singleton that drains the outbox.
- **Stock movement** — an `entry` (received stock) or `exit`
  (consumed / sold stock) on a product. The local quantity is the
  running sum of synced movements.
- **Critical stock alert** — a notification raised when a product's
  quantity drops below its per-tenant threshold. See `alerts`.
