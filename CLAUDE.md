# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

TaskManager-API is a **backend-engineering teaching project** — a production-style REST API for managing tasks, built incrementally as a 14-phase course to learn backend from scratch. The course is complete (14/14 phases). The `docs/` directory contains ~30 numbered concept guides (`01-Introduction.md` … `32-Deployment.md`) plus `docs/API-Contract.md`, which is the authoritative HTTP contract.

Because it is a teaching codebase, comments are unusually dense and deliberate — they explain *why*, not just *what*. Preserve that style when editing: match the surrounding comment depth and the "reasoning-first" tone.

## Commands

TypeScript source compiled to CommonJS. Node >= 22.

```bash
npm run dev            # tsx watch src/server.ts — hot-reload dev server (default :3000)
npm run build          # tsc -p tsconfig.build.json → dist/ (excludes *.test.ts)
npm run typecheck      # tsc --noEmit — type-checks src AND tests (base tsconfig includes tests)
npm start              # node dist/server.js — runs the compiled build

npm test               # vitest run — all tests
npm run test:watch     # vitest (watch mode)
npm run test:unit      # excludes *.integration.test.ts (pure unit + mocked-repo tests)
npm run test:integration  # only integration tests (spins up mongodb-memory-server)
npm run test:coverage  # vitest run --coverage (@vitest/coverage-v8)

npm run seed              # tsx scripts/seed.ts — registers/reuses seed@example.com, POSTs sample tasks via real HTTP
npm run migrate:orphans   # tsx scripts/migrate-orphan-tasks.ts — dry-run by default; pass --apply to delete
```

Run a single test file / test:
```bash
npx vitest run src/services/tasks.service.test.ts
npx vitest run -t "returns 404"        # by test name
```

Two tsconfigs on purpose: base `tsconfig.json` (`include: ["src"]`) type-checks tests but does NOT include `scripts/` (they run via tsx, so `tsc --noEmit` won't catch errors there — known gap). `tsconfig.build.json` excludes `**/*.test.ts` so `npm run build` never ships test code.

## Environment / running locally

Copy `.env.example` → `.env` and fill values. `MONGODB_URI` and `JWT_SECRET` (min 32 chars) are **required with no defaults** — the process fails fast at startup if either is missing. `config/index.ts` is the *only* file that reads `process.env`; everything else imports typed, validated values from `config`.

- Integration tests use **mongodb-memory-server** and do NOT need Atlas or `.env` DB access. If the mongod binary auto-download is unreliable, set `MONGOMS_SYSTEM_BINARY` to a local `mongod(.exe)`.
- The app itself needs a reachable MongoDB. Atlas requires the current public IP in Network Access; if the dev server can't connect, that whitelist is the usual cause.

## Architecture

Strict layered request flow. Each layer has one job; the boundaries are the point of the design:

```
request
  → request-logger        (mints/reuses reqId, attaches req.log child logger, logs completion)
  → helmet + express.json (security headers, body parsing)
  → route (routes/*.routes.ts)      wiring only — no logic
  → requireAuth (middleware)        Bearer→jwt.verify→req.userId (mounted router-level on tasks)
  → validateBody(schema)            zod parse; failure throws ValidationError
  → controller (controllers/*)      HTTP only: read req, call service, shape response
  → service (services/*)            domain rules, sorting, defaults, invariants — pure, DB-agnostic
  → repository (database/*)         the storage contract; Mongoose/lean; owner-scoped queries
  → errorHandler (LAST middleware)  the ONLY place errors become HTTP responses
```

Key rules that hold across the codebase:

- **`app.ts` builds the app; `server.ts` runs it.** No `.listen()` in `app.ts` — tests import the app and drive it in-process via supertest, no port. `server.ts` connects to the DB *before* listening, and registers graceful shutdown.
- **Errors are always thrown, never formatted inline.** `src/errors/app-error.ts` defines `AppError` and subclasses (`NotFoundError`, `ValidationError`, `UnauthorizedError`, `ConflictError`) carrying `statusCode` + `details`. `middlewares/error-handler.ts` is the single formatter: `headersSent` guard → SyntaxError(400) → AppError → generic 500 (logged). Even the 404 fallback and validation failures throw. Relies on Express 5's built-in async error forwarding.
- **Zod schemas are the source of truth for types.** `validators/*.schemas.ts` define shapes; `types/*.ts` are type-only re-exports via `z.infer`. `validateBody` (a middleware factory in `middlewares/validate.ts`) guarantees `req.body` matches, so controllers read `req.body as XInput` on that guarantee.
- **Authorization is owner-scoping, not post-fetch checks.** `ownerId` is a **required argument** on every repository read/write and leads the service signatures — an unscoped query won't compile. Queries filter by `ownerId` (`findOne`/`updateOne`/etc. all include it), so a foreign task is *unfetchable*, not fetched-then-rejected (prevents IDOR). A foreign/missing task returns **404, not 403** (existence is secret; 403 would enable enumeration). `ownerId` is server-set from the token, never from the body (zod `strictObject` rejects it + service ignores body — defense in depth).
- **Contract precedence: 400 → 422 → 401 → 404.** Auth gate precedes validation (401 before 422); validation precedes lookup (422 before 404). See `docs/API-Contract.md`.
- **Config fails fast.** Required secrets throw at startup with a clear message rather than defaulting.
- **Logging:** one shared pino logger (`src/logger.ts`) — JSON in prod, pino-pretty in dev, `silent` in test (log code still runs). `request-logger` attaches a per-request `req.child({reqId})` as `req.log`; the error handler uses `req.log ?? logger` so 500s carry the reqId. Redaction paths cover passwords/tokens/auth headers. Express types are augmented in `src/types/express.d.ts` (`req.userId`, `req.id`, `req.log`).
- **CLI scripts** (`scripts/`) deliberately keep `console.log` (human CLI output). No `console.*` remains in `src/` app code.

## Windows / environment quirks

- npm installs sometimes exit 1 on the first try and succeed on retry (Defender killing node.exe mid-run) — retry before diagnosing. Heavy dependency trees may need `npm install -D <pkg> --ignore-scripts --prefer-offline --no-audit --no-fund`.
- The user often runs `npm run dev` themselves — port 3000 may be their live server. Identify the process before killing; prefer testing against their running server and cleaning up test data after.
- Backgrounding a dev server with shell `&` can leave a zombie node holding port 3000 after the wrapper is killed (serving a stale build). Use the `run_in_background` tool and kill via `Get-NetTCPConnection -LocalPort 3000` → `Stop-Process`.
- Real SIGTERM can't be delivered to a child process on Windows (maps to force-kill); test graceful shutdown via `process.emit('SIGTERM')` in-process — the handlers themselves are correct for Linux containers.
