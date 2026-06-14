# AGENTS.md

StockZen is a full-stack SaaS inventory management app for small businesses — an AI-driven development benchmark testing end-to-end web app construction and maintenance.

<critical>
- Multi-tenant RLS is non-negotiable. All DB access must be tenant-scoped via `withTenantContext()`. Never bypass the tenant helper.
- `stock_movements` and `audit_events` are append-only — never UPDATE or DELETE rows.
- All client mutations go through the outbox → `/api/sync` pipeline. Never write directly to DB from client code.
- Schema source of truth: `apps/web/src/server/db/schema.ts` — never duplicate schema definitions.
- Path alias `~/` maps to `src/`. Use it for all imports within the app.
- TypeScript strict mode: no `any` (use `unknown` + type guards), `noUncheckedIndexedAccess`, `verbatimModuleSyntax`.
</critical>

## Working Agreements

- All commands run from project root via **mise tasks** (`.mise.toml`). mise handles `cd apps/web` automatically.
- No ESLint or Prettier configured — follow the existing code style consistently.
- Services export singleton objects (`alertService`, `inventoryService`), accept `db` as a parameter for dependency injection.
- Zod schemas centralized in `src/schemas/` (one file per domain). Input schemas (permissive) vs Output schemas (strict).
- Types inferred from Zod: `z.infer<typeof schema>` — never manually duplicate schema types.
- No barrel exports (`index.ts`) — import directly by path.

## Repository Expectations

- Run `mise run typecheck` and `mise run test` before pushing.
- Run `mise run test-e2e` if touching user-facing flows.
- Add or update tests for the code you change, even if nobody asked.
- Use Conventional Commits: `type(scope): short description` (e.g. `fix(products): ...`, `feat(sync): ...`).

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `Sokoshy/stockZen`; GitHub-bound content should be written in French. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five canonical roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context layout — `CONTEXT-MAP.md` at root points to per-feature `CONTEXT.md` files. System-wide ADRs at `docs/adr/`, feature-scoped ADRs at `src/<feature>/docs/adr/`. See `docs/agents/domain.md`.
