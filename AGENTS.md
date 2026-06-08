# AGENTS.md

## Project Overview

StockZen is a full-stack SaaS inventory management app for small businesses (bakeries, restaurants, grocery stores). It's designed as a benchmark for AI-driven development — an experiment testing whether an AI can build and maintain a complete web application end-to-end.

**Key technical concerns:** multi-tenant RLS, offline-first sync, Stripe payments, tRPC API, Better Auth.

## Stack

| Layer | Tech |
|-------|------|
| Runtime | TypeScript (strict, ESM) |
| Framework | Next.js 15 (App Router, `--turbo`) |
| Package manager | Aube (via mise) |
| Database | PostgreSQL 18 (via Docker) |
| ORM | Drizzle ORM |
| API | tRPC (internal) + REST (offline sync) |
| Auth | Better Auth |
| UI | Tailwind CSS v4 + shadcn/ui |
| Offline | IndexedDB (Dexie) |
| Payments | Stripe |
| Deployment | Docker → Fly.io |

## Monorepo Structure

```
stockZen/
├── apps/web/              ← main Next.js app
│   ├── src/
│   │   ├── app/           # Next.js App Router (routes, layouts, pages)
│   │   ├── components/    # React components (ui/ for shadcn, features/ by domain)
│   │   ├── features/      # Modules fonctionnels par domaine (9 modules)
│   │   ├── server/        # tRPC procedures, services, DB (Drizzle schema + RLS)
│   │   │   ├── api/       # tRPC routers + procedures
│   │   │   ├── better-auth/ # Config Better Auth (8 fichiers)
│   │   │   ├── db/        # Drizzle schema, connexion, RLS
│   │   │   └── services/  # Services métier (8 modules)
│   │   ├── lib/           # Utilities, env config
│   │   ├── schemas/       # Shared Zod schemas (10 fichiers)
│   │   └── trpc/          # tRPC client setup (server + react)
│   └── tests/
│       ├── unit/          # Vitest unit tests
│       ├── integration/   # 16 fichiers d'intégration
│       ├── e2e/           # Playwright E2E tests
│       ├── helpers/       # Factories, DB test, contexte tRPC
│       └── support/       # Page objects Playwright
├── docs/agents/           # Agent skill config (issue tracker, triage, domain)
├── _bmad-output/          # Planning artifacts (architecture, PRD, UX spec)
└── docker-compose.yml     # PostgreSQL 18
```

## Setup Commands

```bash
# Clone and install
git clone git@github.com:Sokoshy/stockZen.git
cd stockZen
mise install

# Environment — copy .env.example to .env and fill in secrets
cp apps/web/.env.example apps/web/.env

# Start PostgreSQL
docker compose up -d

# Run database migrations
mise run db-migrate

# Start dev server
mise run dev
```

## Development Workflow

All commands are run via **mise tasks** (defined in `.mise.toml`):

- **Dev server:** `mise run dev` (alias: `mise run d`)
- **Type checking:** `mise run typecheck` (alias: `mise run t`)
- **Database studio:** `mise run db-studio`
- **Generate migrations:** `mise run db-generate`
- **Push schema (dev):** `mise run db-push`
- **Production build:** `mise run build` (alias: `mise run b`)
- **Lint (typecheck + test):** `mise run lint`

All commands run from the project root. mise handles the `cd apps/web` automatically.

## Testing Instructions

All tests live in `apps/web/tests/`.

### Unit / Integration (Vitest)

```bash
# Run all unit + integration tests
mise run test

# Watch mode (development)
mise run test-watch

# With coverage
cd apps/web && aubr test:coverage

# Run a single test file
cd apps/web && aubr vitest run tests/unit/some-file.test.ts

# Run tests matching a name pattern
cd apps/web && aubr vitest run -t "test name"
```

- Environment: jsdom
- Setup file: `tests/setup.ts`
- E2E tests are excluded from Vitest automatically
- No mocking de DB — vraie PostgreSQL de test (`TEST_DATABASE_URL`)
- Test factories via tRPC réel (`tests/helpers/tenant-test-factories.ts`)
- Cleanup systématique dans `beforeEach`

### End-to-End (Playwright)

```bash
# Run all E2E tests
mise run test-e2e

# Debug mode (step through)
cd apps/web && aubr test:e2e:debug

# Headed (see the browser)
cd apps/web && aubr test:e2e:headed
```

- Test dir: `tests/e2e/`
- Expects dev server running at `http://localhost:3000`
- Browser: Chromium only
- Reports: `test-results/playwright/` (HTML + JUnit)
- Artifacts: traces, screenshots, video on failure

### Testing priorities

1. **RLS anti-leak tests** — tenant isolation must be airtight
2. **Offline sync tests** — idempotence, retry, outbox pattern
3. **Stripe webhook tests** — payment flow correctness

## Code Style

### Naming conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Variables / functions | `camelCase` | `getStockLevel` |
| Components / types | `PascalCase` | `StockAlert`, `ProductRow` |
| Files | `kebab-case` | `stock-movement.ts` |
| Database tables | `snake_case` | `stock_movements` |
| DB enums | `snake_case` | `"tenant_role"`, `"movement_type"` |
| Constants | `camelCase` | `SNOOZE_DURATION_HOURS` (no SCREAMING_SNAKE) |
| Service singletons | `camelCase` | `alertService`, `inventoryService` |

### TypeScript

- **Strict mode** enabled (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`)
- Path alias: `~/` maps to `src/` (use `~/server/...`, `~/lib/...`, etc.)
- No `any` — use `unknown` and narrow with type guards
- Types inferred from Zod schemas: `z.infer<typeof schema>`

### Formatting

- No ESLint config file found — follow the existing code style
- No Prettier config found — formatting is manual but consistent
- Use the formatter configured in your editor (Prettier recommended)

### Imports

- Use `~/` path alias for absolute imports within the app
- Never use relative imports in server code
- Prefer named exports
- No barrel exports (`index.ts`) — import directly by path

### Validation

- Zod schemas centralized in `src/schemas/` (one file per domain)
- Input schemas (permissive) vs Output schemas (strict)
- `.superRefine()` for complex business logic validation

## API Boundaries

- **tRPC** — internal use only (server-to-server, React Query). 28 procedures across 7 routers.
- **REST** — offline sync endpoint at `/api/sync` (rate-limited 30/min)
- **Webhooks** — 3 outbound (password reset, invitations, critical alerts). All optional via env vars.
- **No Stripe webhooks** — billing exists but no payment processor integrated yet.

## Key Domain Rules

- **Multi-tenancy:** All DB access is tenant-scoped via RLS. Never bypass the tenant helper. Protected procedures wrap execution in `withTenantContext(tenantId, tx)`.
- **Audit trail:** `stock_movements` is append-only — never UPDATE or DELETE rows.
- **Offline writes:** All mutations go through the outbox → `/api/sync` pipeline. Never write directly to DB from client code.
- **Schema location:** `src/server/db/schema.ts` — single source of truth for all Drizzle schemas.
- **Auth:** Better Auth handles email+password + GitHub OAuth. Sessions via cookie `__session`.
- **Services pattern:** Export singleton objects (`alertService`, `inventoryService`), take `db` as param.

## Build and Deployment

```bash
# Production build
mise run build

# Preview production build locally
mise run preview

# Docker build (outputs standalone) — NOTE: no Dockerfile exists yet
docker build .
```

- Next.js output mode: `standalone` (configured in `next.config.ts`)
- Env validation runs at startup — skip with `SKIP_ENV_VALIDATION=1` for Docker builds

## Pull Request Guidelines

- Run `mise run typecheck` and `mise run test` before pushing
- Run `mise run test-e2e` if touching user-facing flows
- Add or update tests for the code you change, even if nobody asked
- **No CI enforcement** — checks are manual (no GitHub Actions configured)

## Important Paths

| Path | Description |
|------|-------------|
| `apps/web/src/server/db/schema.ts` | Drizzle schema — single source of truth |
| `apps/web/src/server/api/trpc.ts` | tRPC context, middlewares, protectedProcedure |
| `apps/web/src/server/api/root.ts` | tRPC root router assembly |
| `apps/web/src/server/api/routers/` | 7 tRPC routers (auth, products, alerts, dashboard, billing, stockMovements, tenantThresholds) |
| `apps/web/src/server/services/` | 8 service modules (business logic) |
| `apps/web/src/server/better-auth/` | Better Auth config and helpers |
| `apps/web/src/schemas/` | Zod schemas (10 files, one per domain) |
| `apps/web/src/features/` | Feature modules (9 domains, components/hooks/queries/utils) |
| `apps/web/src/lib/env.ts` | Environment variable validation (T3 env) |
| `apps/web/src/trpc/` | tRPC client setup (server + react) |
| `apps/web/tests/` | All tests (unit, integration, e2e, helpers) |
| `apps/web/drizzle/` | 21 Drizzle migrations |
| `.mise.toml` | Task runner configuration |
| `docker-compose.yml` | PostgreSQL 18 container |
| `docker/init-db.sql` | DB init script (role `stockzen_app`) |

## Agent Skills

### Issue tracker

Issues live in GitHub Issues, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context layout — `CONTEXT-MAP.md` at root points to per-context `CONTEXT.md` files. ADRs at `docs/adr/` (system-wide) and `src/<context>/docs/adr/` (context-scoped). See `docs/agents/domain.md`.

## Known Gaps

- **No Dockerfile** — `output: "standalone"` configured but no Dockerfile exists
- **No CI/CD** — no GitHub Actions, GitLab CI, or any automation
- **No ESLint/Prettier** — no linter or formatter configured
- **No Stripe integration** — billing module exists but no payment processor
- **Legacy script** — `start-database.sh` superseded by docker-compose.yml
- **Missing env vars in .env.example** — `TEST_ENV`, `BASE_URL`, `API_URL` are undocumented
