# Story 1.1: Set up Initial Project from Starter Template (Create T3 App)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to initialize the project using the selected starter template and baseline tooling,
so that the team can implement features consistently on a working foundation.

## Acceptance Criteria

1. **Given** the architecture specifies “Create T3 App” as the selected starter
   **When** I initialize the project with `bun create t3-app@latest apps/web`
   **Then** the repository contains a working Next.js (App Router) TypeScript app scaffold
   **And** the project builds and starts locally using the standard dev command(s)

2. **Given** the architecture specifies Drizzle ORM as authoritative
   **When** starter defaults would introduce conflicting ORM choices
   **Then** the project is aligned to use Drizzle + drizzle-kit for migrations going forward
   **And** no Prisma-only assumptions remain in the baseline

## Tasks / Subtasks

- [x] Scaffold baseline app with Create T3 App (AC: 1)
  - [x] Run `bun create t3-app@latest apps/web` and select options that do not lock us into Prisma/NextAuth by default
  - [x] Ensure the generated project uses Next.js App Router + TypeScript and starts locally
  - [x] Verify local commands: `bun run dev` and `bun run build`

- [x] Align starter output to the project architecture baseline (AC: 1)
  - [x] Ensure folder layout matches the architecture target (`apps/web`, App Router under `apps/web/src/app`)
  - [x] Ensure Bun is the package manager (commit `bun.lock`)

- [x] Ensure Drizzle baseline (and remove conflicting ORM assumptions) (AC: 2)
  - [x] Remove Prisma dependencies/files if introduced by the starter
  - [x] Add Drizzle ORM + drizzle-kit baseline config (no migrations required yet, but structure must exist)
  - [x] Create/verify `apps/web/drizzle/` and `apps/web/drizzle/migrations/` directories exist for SQL migrations

## Dev Notes

- Goal of this story is a clean, working foundation only. Do **not** implement product features, offline sync logic, RLS, billing, or dashboards yet.
- The starter command is mandated by architecture: `bun create t3-app@latest apps/web`. Keep the scaffold close to upstream; avoid premature customization.
- Package manager: Bun. Commit `apps/web/bun.lock` and do not introduce npm/pnpm/yarn lockfiles.
- ORM: Drizzle is authoritative. If the scaffold pulls in Prisma, remove Prisma wiring completely (deps, schema, generated client, scripts, env docs).
- API boundary baseline: tRPC is the internal contract; REST route handlers are reserved for offline sync (`/api/sync`) later. Don’t invent new REST endpoints during setup.
- Auth: Better Auth is the chosen library (pin maintained 1.x, enforce `>= 1.2.10`). Avoid NextAuth-based assumptions.
- Naming/boundaries to preserve from day 1:
  - DB: `snake_case` tables/columns; API/JSON: `camelCase` only.
  - Zod schemas must live in `apps/web/src/schemas/**` and be shared between server and client forms.
  - Client code must never import `apps/web/src/server/**`.
- Definition of done (practical): `bun run dev` starts, `bun run build` succeeds, and the repo has the expected `apps/web` structure aligned with architecture.

### Technical Requirements

- Scaffold:
  - MUST use: `bun create t3-app@latest apps/web`.
  - MUST generate: Next.js App Router + TypeScript.
  - Prefer selecting options that avoid hard-wiring Prisma or NextAuth into the scaffold (we use Drizzle + Better Auth).
- Type-safe API baseline: tRPC v11 is the primary internal API style; keep the generated tRPC wiring if offered by the template.
- Data layer baseline (authoritative): Drizzle ORM + drizzle-kit SQL migrations checked into repo.
- Security baseline for future stories (do not fully implement here, but avoid incompatible choices): Better Auth (maintained 1.x, enforce `>= 1.2.10`) with DB-backed sessions (no primary JWT auth).
- Multi-tenancy baseline for future stories: tenant isolation via Postgres RLS (`tenant_id` + `SET LOCAL app.tenant_id`) is mandatory later; do not choose patterns that prevent this (e.g., client-side-only data model).
- Logging/monitoring baseline for future stories: pino JSON logs; Sentry for Next.js (wire-up can be deferred, but avoid conflicting logging frameworks).

### Project Structure Notes

- Target structure is defined in `_bmad-output/planning-artifacts/architecture.md` (Docker-first, `apps/web`, feature-first under `src/features/**`).

### Architecture Compliance

- Starter alignment:
  - Architecture mandates Create T3 App as baseline (`bun create t3-app@latest apps/web`).
  - Treat Drizzle as authoritative even if T3 defaults suggest Prisma. Remove Prisma rather than running both.
- Boundaries:
  - Keep tRPC under `apps/web/src/server/api/**` and `apps/web/src/app/api/trpc/[trpc]/route.ts` (as per target tree in architecture).
  - Reserve `apps/web/src/app/api/sync/route.ts` for later offline sync work; do not implement it in Story 1.1.
  - Keep server-side business logic under `apps/web/src/server/services/**` (to be populated in later stories).
- Conventions:
  - DB naming: `snake_case` (tables/columns); API/JSON naming: `camelCase`.
  - ISO 8601 UTC date strings in API payloads (avoid numeric timestamps).
  - No cross-feature imports except via shared layers (`apps/web/src/components`, `apps/web/src/lib`, `apps/web/src/schemas`).

### Library & Framework Requirements

- Use the architecture as the source of truth for the baseline stack and keep versions on the intended major/minor lines:
  - Next.js: App Router.
  - tRPC: v11.
  - Drizzle ORM: 0.44.x line; drizzle-kit: keep in sync.
  - Better Auth: maintained 1.x, enforce `>= 1.2.10`.
  - Dexie: IndexedDB wrapper (offline module will use it later; no implementation needed here).
  - Serwist: `@serwist/next` (PWA will use it later; no implementation needed here).
  - Logging: pino (structured JSON).
  - Monitoring: `@sentry/nextjs`.

- Avoid incompatible scaffolding choices:
  - If Create T3 App prompts for ORM/auth defaults, prefer choices that do not bake in Prisma or NextAuth as the primary path.
  - Do not introduce alternative logging (winston, console-based) or alternative telemetry frameworks.

### File Structure Requirements

- Repository layout baseline (minimum):
  - Next.js app lives in `apps/web`.
  - App Router routes live in `apps/web/src/app/**`.
  - Server-only code lives in `apps/web/src/server/**`.
  - Shared schemas live in `apps/web/src/schemas/**`.
  - Shared libs live in `apps/web/src/lib/**` with env access centralized in `apps/web/src/lib/env.ts`.
  - UI primitives (shadcn) live in `apps/web/src/components/ui/**`.
  - Feature modules live in `apps/web/src/features/**` (feature-first).
  - SQL migrations live under `apps/web/drizzle/migrations/**` (checked into git).

- Hygiene:
  - No duplicate Next.js apps (no second `src/app` at repo root).
  - Do not place server code under feature folders in a way that violates the `src/server/**` boundary.

### Testing Requirements

- For Story 1.1, tests are minimal: the scaffold must build and run.
- Do not introduce a new test stack yet unless the scaffold requires it.
- Keep the intended test layout reserved for later stories (do not remove if scaffold creates it):
  - `apps/web/tests/unit/**`
  - `apps/web/tests/integration/**`
  - `apps/web/tests/e2e/**`
  - `apps/web/tests/fixtures/**`
  - `apps/web/tests/helpers/**`

- Future-critical test areas (for context only; not implemented in 1.1):
  - Postgres RLS anti-tenant-leak integration tests.
  - Offline sync contract/idempotency tests.
  - Stripe webhook signature verification tests.

### Latest Tech Information (Reference Only)

- Use this only to avoid outdated assumptions; do not perform major upgrades as part of Story 1.1.
- Observed current package versions (2026-02-04):
  - `create-t3-app`: 7.40.0 (scaffold tool)
  - Next.js (registry latest): 16.1.6 (Node engine >= 20.9.0)
  - tRPC (`@trpc/server` latest): 11.9.0
  - Drizzle ORM (latest): 0.45.1; architecture intends 0.44.x line
  - `drizzle-kit` (latest): 0.31.8
  - `better-auth` (latest): 1.4.18 (stay on maintained 1.x, enforce `>= 1.2.10`)
  - `dexie` (latest): 4.3.0
  - `@serwist/next` (latest): 9.5.3
  - `pino` (latest): 10.3.0
  - `@sentry/nextjs` (latest): 10.38.0

- Guardrails:
  - Keep the scaffolded Next.js major version unless there is a dedicated upgrade PR (per `_bmad-output/project-context.md`).
  - If the scaffold introduces versions outside the architecture’s intended lines, prefer aligning to architecture over chasing registry-latest.

- Expected baseline paths (create them as part of scaffold/alignment if missing):
  - `apps/web/src/app/**` (Next.js App Router)
  - `apps/web/src/server/**` (server-only code)
  - `apps/web/src/features/**` (feature-first modules)
  - `apps/web/src/components/ui/**` (shadcn)
  - `apps/web/src/lib/env.ts` (central env access)
  - `apps/web/drizzle/` + `apps/web/drizzle/migrations/` (SQL migrations checked in)

### References

- `_bmad-output/planning-artifacts/epics.md` (Story 1.1)
- `_bmad-output/planning-artifacts/architecture.md` (Starter Template Evaluation, Project Structure & Boundaries)
- `_bmad-output/project-context.md` (stack + boundary rules)

### Project Context Reference

- This story must comply with `_bmad-output/project-context.md` rules:
  - Bun is package manager; avoid Bun-only runtime APIs.
  - tRPC + REST boundaries (`/api/sync` reserved for later).
  - Env var access via `apps/web/src/lib/env.ts`.
  - Prevent client importing `apps/web/src/server/**`.
  - Future guardrails: RLS, offline outbox, idempotency, and purchase price masking.

## Dev Agent Record

### Agent Model Used

openai/gpt-5.2

### Implementation Plan

- Scaffold Create T3 App with Bun and CI flags to keep App Router + TS + Tailwind + tRPC + Drizzle + Better Auth.
- Align baseline structure (drizzle/migrations, components/ui, features, schemas, lib/env) and update env/config wiring.
- Verify `bun run dev` and `bun run build`, capturing warnings and required env vars.

### Debug Log References

- `bun create t3-app@latest apps/web --CI --appRouter true --tailwind true --trpc true --drizzle true --betterAuth true --nextAuth false --prisma false --dbProvider postgres --noGit`
- `bun install` (apps/web)
- `BETTER_AUTH_GITHUB_CLIENT_ID=dummy BETTER_AUTH_GITHUB_CLIENT_SECRET=dummy bun run dev` (startup verified)
- `BETTER_AUTH_GITHUB_CLIENT_ID=dummy BETTER_AUTH_GITHUB_CLIENT_SECRET=dummy bun run build`
- `bun add next@15.5.7`
- `BETTER_AUTH_GITHUB_CLIENT_ID=dummy BETTER_AUTH_GITHUB_CLIENT_SECRET=dummy bun run dev` (startup verified after Next.js alignment)

### Completion Notes List

- Scaffolded `apps/web` with Create T3 App (App Router, TypeScript, Tailwind, tRPC, Drizzle, Better Auth) using Bun.
- Aligned baseline structure (drizzle/migrations, components/ui, features, schemas, lib/env) and updated Next/Drizzle env wiring.
- Updated Drizzle ORM/drizzle-kit versions to the 0.44.x/0.31.x lines.
- Verified `bun run dev` and `bun run build` with Better Auth GitHub env vars set; Better Auth base URL warnings and @next/swc mismatch warnings observed.
- Added `BETTER_AUTH_BASE_URL` to config to remove Better Auth base URL warnings.
- Aligned Next.js to 15.5.7 to remove the @next/swc version mismatch warning.
- Revalidated `bun run dev` after Next.js alignment.

### File List

- `_bmad-output/implementation-artifacts/1-1-set-up-initial-project-from-starter-template-create-t3-app.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `apps/web/.env.example`
- `apps/web/.gitignore`
- `apps/web/README.md`
- `apps/web/bun.lock`
- `apps/web/drizzle.config.ts`
- `apps/web/drizzle/migrations/.gitkeep`
- `apps/web/next.config.ts`
- `apps/web/package.json`
- `apps/web/postcss.config.js`
- `apps/web/public/favicon.ico`
- `apps/web/src/app/_components/post.tsx`
- `apps/web/src/app/api/auth/[...all]/route.ts`
- `apps/web/src/app/api/trpc/[trpc]/route.ts`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/components/ui/.gitkeep`
- `apps/web/src/features/.gitkeep`
- `apps/web/src/lib/env.ts`
- `apps/web/src/schemas/.gitkeep`
- `apps/web/src/server/api/root.ts`
- `apps/web/src/server/api/routers/post.ts`
- `apps/web/src/server/api/trpc.ts`
- `apps/web/src/server/better-auth/client.ts`
- `apps/web/src/server/better-auth/config.ts`
- `apps/web/src/server/better-auth/index.ts`
- `apps/web/src/server/better-auth/server.ts`
- `apps/web/src/server/db/index.ts`
- `apps/web/src/server/db/schema.ts`
- `apps/web/src/styles/globals.css`
- `apps/web/src/trpc/query-client.ts`
- `apps/web/src/trpc/react.tsx`
- `apps/web/src/trpc/server.ts`
- `apps/web/start-database.sh`
- `apps/web/tsconfig.json`

## Change Log

- 2026-02-04: Scaffolded Create T3 App baseline in `apps/web`, aligned Drizzle structure and env/config wiring, and verified dev/build.
- 2026-02-04: Moved Better Auth GitHub redirect URI to env configuration.
- 2026-02-04: Added Better Auth base URL config via environment variable.
- 2026-02-04: Aligned Next.js to 15.5.7 to resolve @next/swc mismatch warning.
