# Test Suite Guide

This project uses two test layers:

- Vitest for unit, integration, and UI tests
- Playwright for browser-level E2E scenarios in `tests/e2e/*.spec.ts`

## Setup

1. Use Node defined in `.nvmrc`.
2. Install dependencies:

```bash
npm install
```

3. Copy environment template and set values:

```bash
cp .env.example .env
```

## Running Tests

- Vitest (all):

```bash
npm test
```

- Playwright E2E:

```bash
npm run test:e2e
```

- Playwright headed mode:

```bash
npm run test:e2e:headed
```

- Playwright debug mode:

```bash
npm run test:e2e:debug
```

## Architecture Overview

- `tests/support/fixtures/`: fixture composition and cleanup orchestration
- `tests/support/factories/`: faker-based data factories with overrides
- `tests/support/helpers/`: API, auth, and network helpers
- `tests/e2e/*.spec.ts`: Playwright scenarios using data-testid selectors and Given/When/Then sections

## Best Practices

- Use `data-testid` selectors for E2E interactions.
- Keep setup API-first (fixtures/factories/helpers), then validate UI behavior.
- Register route interception before navigation to avoid race conditions.
- Keep tests isolated and cleanup side effects through the `cleanup` fixture.

## CI Notes

- Playwright config writes artifacts to `test-results/playwright/`.
- HTML + JUnit reporters are enabled for local and CI diagnostics.
- CI retries are enabled in `playwright.config.ts` while local retries stay disabled.

## Knowledge References Applied

- `_bmad/tea/testarch/knowledge/overview.md`
- `_bmad/tea/testarch/knowledge/fixtures-composition.md`
- `_bmad/tea/testarch/knowledge/auth-session.md`
- `_bmad/tea/testarch/knowledge/api-request.md`
- `_bmad/tea/testarch/knowledge/burn-in.md`
- `_bmad/tea/testarch/knowledge/network-error-monitor.md`
- `_bmad/tea/testarch/knowledge/data-factories.md`
