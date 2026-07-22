# Task Manager API

A production-style REST API for managing tasks, built with Node.js and Express.

This project doubles as a complete backend engineering course: every concept used
(HTTP, routing, middleware, validation, error handling, persistence, auth, testing,
deployment) is documented in depth in the [`docs/`](docs/) folder.

## Features (built in phases)

- Create, read, update, and delete tasks
- Each task: `id`, `title`, `description`, `completed`, `priority`, `dueDate`, `createdAt`, `updatedAt`
- Validation, structured error handling, and production patterns throughout

## Tech Stack

- **Runtime:** Node.js (v22)
- **Language:** TypeScript (strict), compiled to CommonJS
- **Framework:** Express.js
- **Storage:** in-memory → file-based → MongoDB (introduced phase by phase)

## Getting Started

```bash
npm install
cp .env.example .env   # local configuration (see docs/16-Environment-Variables.md)
npm run dev            # development: tsx watch (auto-restarts on save)
```

Other scripts:

```bash
npm run typecheck        # type-check only, no output files
npm run build            # compile src/ -> dist/ with tsc
npm start                # run the compiled production build
npm run seed             # register a seed user + POST the sample tasks (needs a running server)
npm run migrate:orphans  # report owner-less tasks; add -- --apply to delete them
```

Tests:

```bash
npm test                 # run the whole suite once
npm run test:watch       # re-run affected tests on save (tight dev loop)
npm run test:unit        # fast unit tests only (no database)
npm run test:integration # integration tests only (uses an in-memory MongoDB)
npm run test:coverage    # full suite + coverage report
```

## Production

```bash
npm run typecheck && npm test   # gate: types + tests must pass
npm run build                   # compile src/ -> dist/ (app code only)
npm start                       # node dist/server.js
```

Configuration is entirely environment-driven (see [`.env.example`](.env.example)
and [docs/32-Deployment.md](docs/32-Deployment.md)). Required in production:
`MONGODB_URI` and `JWT_SECRET` (both fail fast if missing). The process reports
readiness at `GET /health` (503 when the DB link is down) and shuts down
gracefully on `SIGTERM`/`SIGINT` (drains in-flight requests, closes the DB).
Log JSON to stdout; terminate TLS at your proxy and set `TRUST_PROXY` to the
real hop count.

## Project Status

- ✅ Phase 1: Project Initialization — git, npm, TypeScript toolchain, raw Node
  http server, Express app/server split, validated env-based configuration.
- ✅ Phase 2: Express Fundamentals — req/res anatomy, health endpoint, REST
  principles, the [v1 API contract](docs/API-Contract.md), request/response
  lifecycles traced end to end.
- ✅ Phase 3: Routing — all five contract endpoints live on `/api/v1/tasks`:
  create (201+Location), list (filters + sorting), get-one, patch
  (absent-vs-null semantics), delete (204); uniform error envelope.
- ✅ Phase 4: Controllers — HTTP layer extracted to named `RequestHandler`
  functions; routes reduced to wiring; envelope helpers deduplicated;
  behavior proven identical by sweep.
- ✅ Phase 5: Middleware & Services — custom request-logging middleware
  (first in pipeline, finish-event timing); business logic extracted to a
  service layer speaking pure domain; contract precedence codified
  (400 → 422 → 404).
- ✅ Phase 6: Validation — manual validation learned by hand, then zod:
  schemas as single source of truth (`z.infer`), unknown-field rejection,
  UTC normalization, validation mounted as per-route middleware. Zero
  unproven casts remain.
- ✅ Phase 7: Error Handling — typed AppError hierarchy (operational vs
  programmer errors), central four-argument error middleware as the only
  formatter, malformed-JSON HTML leak fixed, all errors travel by throw
  (Express 5 async forwarding verified).
- ✅ Phase 8: File-based Storage — repository layer over a JSON file
  (atomic temp+rename writes, serialized write queue, single-owner cache);
  service and controllers async end to end; state verified to survive a
  process kill.
- ✅ Phase 9: MongoDB Integration — Atlas replica set via Mongoose; UUID as
  `_id`, lean-only repository (same five-function contract — service
  untouched), connect-before-listen, readiness-aware `/health` (503 when
  degraded), filters pushed into the database, `npm run seed` sample data.
- ✅ Phase 10: Authentication — bcrypt-hashed users (cost 12, unique-index
  duplicate authority), login issuing 1-hour JWTs, vague timing-equalized
  401s, `requireAuth` middleware (signature + expiry verification, typed
  `req.userId` via module augmentation) gating all task routes.
- ✅ Phase 11: Authorization — per-user task ownership: `ownerId` stamped
  from the token (never the body), every repository read/write scoped by
  owner (required argument — unscoped access won't compile), foreign tasks
  return 404-not-403 (no cross-user enumeration); orphaned-data migration
  (`npm run migrate:orphans`) and an auth-aware seeder.
- ✅ Phase 12: Testing — Vitest suite (36 tests): pure unit tests (schemas),
  mocked-repository unit tests (service logic), and Supertest integration
  tests driving the real app against an in-memory MongoDB — including the
  authorization guarantee as a regression test. Build/test config split,
  unit/integration script separation, coverage (~82%).
- ✅ Phase 13: Logging — structured logging with pino (JSON in prod, pretty
  in dev, level from `LOG_LEVEL`, secret redaction); per-request logging
  with correlation ids (child logger on `req.log`, reused/echoed
  `X-Request-Id`, level derived from status), errors logged with the reqId.
- ✅ Phase 14: Deployment Preparation — compiled `dist/` build; helmet
  security headers, no `X-Powered-By`, config-driven `trust proxy`; graceful
  shutdown (SIGTERM/SIGINT drain + close + timeout backstop); readiness
  health check; deployment guide.

**🎉 Course complete — all 14 phases done.** See [`docs/`](docs/) for the
full concept-by-concept deep dive built alongside the code.

## Documentation

Concept deep-dives live in [`docs/`](docs/):

| Doc | Covers |
|---|---|
| [01-Introduction](docs/01-Introduction.md) | What a backend is; the trust boundary |
| [02-HTTP](docs/02-HTTP.md) | The protocol: methods, status codes, idempotency |
| [03-REST](docs/03-REST.md) | Resources × methods, URL design, maturity model |
| [04-NodeJS](docs/04-NodeJS.md) | V8, libuv, the event loop, non-blocking I/O |
| [06-Express-Routing](docs/06-Express-Routing.md) | Routers, mounting, route params, order law |
| [07-Controllers](docs/07-Controllers.md) | The HTTP layer; thin-controller principle |
| [08-Middleware](docs/08-Middleware.md) | The pipeline: next(), ordering, custom logger |
| [09-Validation](docs/09-Validation.md) | Parse don't validate; zod; validation middleware |
| [10-Error-Handling](docs/10-Error-Handling.md) | Operational vs programmer errors; the one boundary |
| [11-Status-Codes](docs/11-Status-Codes.md) | Every code this API speaks, with reasoning |
| [17-Project-Architecture](docs/17-Project-Architecture.md) | The four layers and the dependency rule |
| [05-Express](docs/05-Express.md) | The framework: middleware stack, req/res anatomy |
| [12-Request-Lifecycle](docs/12-Request-Lifecycle.md) | Client → handler, every stage, measured |
| [13-Response-Lifecycle](docs/13-Response-Lifecycle.md) | Handler → client, headers-first irreversibility |
| [16-Environment-Variables](docs/16-Environment-Variables.md) | Config, dotenv, fail-fast validation |
| [25-TypeScript](docs/25-TypeScript.md) | Types at compile time, `unknown` at boundaries |
| [26-Persistence](docs/26-Persistence.md) | Files first: atomicity, write queues, cache rules |
| [27-MongoDB](docs/27-MongoDB.md) | Documents, Mongoose, lean reads, readiness |
| [28-Authentication](docs/28-Authentication.md) | bcrypt vs argon2, JWT anatomy, sessions vs tokens |
| [29-Authorization](docs/29-Authorization.md) | Ownership, IDOR, scope-the-query, 403 vs 404 |
| [30-Testing](docs/30-Testing.md) | Pyramid, test doubles, Supertest, in-memory DB, coverage |
| [31-Logging](docs/31-Logging.md) | Structured logs, levels, redaction, correlation ids |
| [32-Deployment](docs/32-Deployment.md) | Build, config, health, shutdown, hardening, checklist |
| [API-Contract](docs/API-Contract.md) | **The v1 contract** — endpoints, shapes, status codes |

(Numbering follows the full course outline; gaps fill in as later phases introduce their concepts.)
