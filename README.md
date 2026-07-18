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
npm run dev        # development: tsx watch (auto-restarts on save)
```

Other scripts:

```bash
npm run typecheck  # type-check only, no output files
npm run build      # compile src/ -> dist/ with tsc
npm start          # run the compiled production build
```

## Project Status

🚧 Phase 1: Project Initialization — in progress.
