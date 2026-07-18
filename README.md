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
- 🚧 Phase 2: Express Fundamentals — next.

## Documentation

Concept deep-dives live in [`docs/`](docs/):

| Doc | Covers |
|---|---|
| [01-Introduction](docs/01-Introduction.md) | What a backend is; the trust boundary |
| [02-HTTP](docs/02-HTTP.md) | The protocol: methods, status codes, idempotency |
| [04-NodeJS](docs/04-NodeJS.md) | V8, libuv, the event loop, non-blocking I/O |
| [05-Express](docs/05-Express.md) | The framework: middleware stack, app/server split |
| [16-Environment-Variables](docs/16-Environment-Variables.md) | Config, dotenv, fail-fast validation |
| [25-TypeScript](docs/25-TypeScript.md) | Types at compile time, `unknown` at boundaries |

(Numbering follows the full course outline; gaps fill in as later phases introduce their concepts.)
