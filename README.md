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
npm run typecheck  # type-check only, no output files
npm run build      # compile src/ -> dist/ with tsc
npm start          # run the compiled production build
```

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
- 🚧 Phase 11: Authorization — next.

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
| [API-Contract](docs/API-Contract.md) | **The v1 contract** — endpoints, shapes, status codes |

(Numbering follows the full course outline; gaps fill in as later phases introduce their concepts.)
