# Deployment Preparation

## Definition

**Deployment preparation** is the work that closes the gap between "runs on my
machine" and "runs safely, unattended, facing the open internet." The features
don't change; what changes is that the app now assumes hostile callers, gets
stopped by signals, runs a compiled build, and must be observable and
configurable from the outside.

This is not a full deploy guide (no specific cloud, CI/CD, or container images) —
it's the *application-side readiness* that any deploy target needs.

## From source to a running production process

Development runs TypeScript directly with `tsx`. Production runs **compiled
JavaScript**:

```bash
npm run build     # tsc -p tsconfig.build.json  →  dist/*.js
npm start         # node dist/server.js
```

Two separate configs make this clean (Phase 12): the base `tsconfig.json`
type-checks everything including tests; `tsconfig.build.json` excludes
`*.test.ts` so the production `dist/` contains only application code — no tests,
no `.d.ts`. Running the *compiled* artifact (not `tsx`) in production means what
you tested is what runs, with no transpiler in the hot path.

**Why compile at all** (vs. shipping `tsx`): faster startup, no dev dependency
in production, and the build step is a gate — if it doesn't compile, it doesn't
ship.

## Configuration: the environment is the interface

Every deploy-varying value comes from the environment, read and validated in one
place (`src/config`, Phase 1). Nothing is hardcoded; secrets have no defaults and
fail fast if missing.

| Var | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | `development` | environment mode |
| `PORT` | no | `3000` | listen port |
| `MONGODB_URI` | **yes** | — (fail fast) | database connection |
| `JWT_SECRET` | **yes** | — (fail fast) | token signing key (≥32 chars) |
| `LOG_LEVEL` | no | `info`(prod)/`debug`(dev) | log verbosity |
| `TRUST_PROXY` | no | `0` | reverse-proxy hop count |

This is the twelve-factor "config in the environment" principle: the same build
artifact runs in staging and production, differing only by env vars. Secrets
never live in the repo (`.env` is gitignored; `.env.example` documents the shape).

## Health checks: liveness vs. readiness

`GET /health` (Phase 9) reports **readiness** — not just "is the process up?"
(liveness) but "can it actually serve?" (readiness). It checks the DB connection
and returns `200` when connected, `503` when degraded. Orchestrators use this:

- **Liveness probe** — "is the process alive?" If it fails, restart the process.
- **Readiness probe** — "should traffic route here *now*?" If it fails (e.g. DB
  link dropped), stop sending requests until it recovers, without killing the
  process.

Returning `503` on a dropped DB connection lets a load balancer route around a
temporarily-degraded instance instead of serving errors.

## Startup and shutdown: the lifecycle bookends

- **Startup (Phase 9):** connect to the database *before* calling `listen`, so
  the first request accepted is one the app can actually serve. A startup
  failure logs `fatal` and exits non-zero — fail fast, let the platform restart.
- **Shutdown (Phase 14.2):** on `SIGTERM`/`SIGINT`, stop accepting new
  connections, drain in-flight requests, close the database, exit `0` — with a
  timeout backstop. Deploys and scale-downs don't drop live traffic.

Bottom-up to start (DB → server), top-down to stop (server → DB). The platform
sends `SIGTERM` with a grace period before `SIGKILL`; graceful shutdown spends
that grace correctly.

## Security hardening (Phase 14.1)

- **No `X-Powered-By`** — don't fingerprint the framework for attackers.
- **helmet** — a suite of security response headers (HSTS, CSP, `nosniff`,
  frame-options, referrer-policy, cross-origin isolation).
- **`trust proxy`** — set to the *real* number of proxy hops so `req.ip` is the
  true client; trusting more lets clients spoof via forged `X-Forwarded-For`.
- **HTTPS is assumed** — terminate TLS at the load balancer / platform; a Bearer
  token over plain HTTP is a stolen login.

## Logging: stdout, structured (Phase 13)

Log JSON to **stdout** and let the platform (Docker/k8s/PaaS) capture and ship it
to an aggregator. The app doesn't manage log files or rotation — that's
infrastructure's job. Correlation ids make requests traceable across the fleet.
Never pretty-print in production (slower, unstructured).

## Production readiness checklist

- [x] Compiled build (`npm run build` → `dist/`), run via `npm start`
- [x] All config from env, validated, secrets fail-fast, nothing hardcoded
- [x] Health endpoint reporting readiness (503 when degraded)
- [x] Connect-before-listen startup; fatal-and-exit on startup failure
- [x] Graceful shutdown on SIGTERM/SIGINT with drain + timeout
- [x] Security headers (helmet), no framework fingerprint, correct trust proxy
- [x] Structured JSON logging to stdout with correlation ids and redaction
- [x] Automated tests (unit + integration) green before deploy
- [ ] *Beyond this course:* CI/CD pipeline, container image, secrets manager,
      rate limiting, monitoring/alerting, DB backups, autoscaling

## What a real deploy adds (beyond this course)

- **Process management** — a platform (Render, Fly, Railway, ECS, k8s) or a
  supervisor (systemd, pm2) that restarts on crash and runs N instances. Node is
  single-threaded per process; horizontal scale = more processes/instances (the
  stateless-JWT design from Phase 10 makes this trivial — any instance verifies
  any token).
- **CI/CD** — run `npm run typecheck && npm test && npm run build` on every push;
  deploy only if green. The build/test gates already exist; CI just automates
  them.
- **Containerization** — a `Dockerfile` (multi-stage: build in one stage, copy
  `dist/` + production deps into a slim runtime image). Config still via env.
- **Secrets management** — inject `JWT_SECRET`/`MONGODB_URI` from the platform's
  secret store, never from a committed file.
- **Rate limiting** — protect auth endpoints from brute force (flagged in Phase
  10); depends on correct `trust proxy` to key on the real IP.
- **Observability** — ship logs to an aggregator, add metrics and alerting on the
  `level >= warn` stream and the health probe.

## Common mistakes

1. **Running `tsx`/`ts-node` in production** — ship the compiled build; keep the
   transpiler out of the hot path and out of production deps.
2. **Hardcoded config or committed secrets** — config is the environment;
   `.env` is gitignored.
3. **No graceful shutdown** — every deploy drops in-flight requests.
4. **Liveness and readiness conflated** — a dropped DB should shed traffic
   (readiness 503), not necessarily kill the process (liveness).
5. **Logging to files inside the app** — log to stdout; let infra handle capture
   and rotation.
6. **Wrong `trust proxy`** — breaks real-IP logging and rate limiting, or enables
   IP spoofing.
7. **Deploying without the test gate** — the suite exists to be the gate; use it.

## Interview questions

1. **Why compile to `dist/` instead of running TypeScript directly in prod?**
   Faster startup, no transpiler in the hot path, no dev deps in production, and
   the build is a gate — non-compiling code doesn't ship.
2. **Liveness vs. readiness probe?** Liveness = "is the process alive?" (fail →
   restart); readiness = "should it get traffic now?" (fail → route around it).
3. **What does graceful shutdown accomplish on deploy?** Drains in-flight
   requests and closes resources cleanly instead of dropping live traffic.
4. **How does this app scale horizontally?** Stateless JWT auth — no shared
   session store, so any instance serves any request; run more instances.
5. **Where do secrets and config come from in production?** The environment,
   injected by the platform's secret store; validated at startup, fail-fast.
6. **Where should logs go in a container?** stdout — the platform captures and
   ships them; the app doesn't own files or rotation.

## Summary

Deployment prep hardens the app for an unattended, hostile, restart-driven
environment: a compiled `dist/` build run via `npm start`; all config from the
validated environment with fail-fast secrets; a readiness health check;
connect-before-listen startup and graceful drain-and-close shutdown; helmet
security headers with a correct `trust proxy`; and structured JSON logs to
stdout with correlation ids. The application side of production-readiness is
done; what remains (CI/CD, containers, secrets managers, monitoring) is
infrastructure that wraps this ready app. The stateless, twelve-factor shape
built across the course is exactly what makes that infrastructure straightforward.

## Further reading

- The Twelve-Factor App (12factor.net) — config, logs, disposability, port
  binding: this course's deployment principles, named
- Node.js docs — `process` signals, `server.close`, cluster
- Docker multi-stage builds; your target platform's deploy docs
- OWASP Secure Headers Project — what helmet sets and why
