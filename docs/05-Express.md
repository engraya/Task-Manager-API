# 05 — Express: The Framework

> Living document — started in Phase 1 (fundamentals); grows with Routing
> (Phase 3), Middleware (Phase 5), and Error Handling (Phase 7).

## Definition

**Express is a minimal web framework for Node.js: a routing and middleware layer
on top of the `http` module.** It adds no new capability to Node — everything
Express does, we did by hand in Step 1.4 — it adds *structure*: declarative
routing, a middleware pipeline, and convenient request/response helpers.

The single most demystifying fact about Express:

```ts
const app = express();   // app is A FUNCTION: (req, res) => void
```

`app` is literally a request-handler function (with extra methods attached).
`app.listen(3000)` is shorthand for:

```ts
http.createServer(app).listen(3000);
```

Express slots into the exact `http.createServer(callback)` hole we used in
Step 1.4. Everything it does happens *inside* that one callback: match the URL,
run the pipeline, help you respond.

## History

- **2010** — TJ Holowaychuk creates Express, inspired by Ruby's Sinatra
  ("micro-framework": routes + middleware, nothing else).
- **2014** — v4: middleware moved out of core into separate packages
  (`body-parser` etc.); the version that dominated a decade.
- **2024** — v5 stable: Promise-aware handlers (rejected promises are passed to
  error middleware automatically — big for us in Phase 7), path-matching updates,
  removal of long-deprecated APIs. **This project runs Express 5.**
- Ecosystem position: still the most-used Node framework; alternatives (Fastify,
  NestJS, Koa, Hono) either compete on speed or add opinionated architecture on
  top of the same concepts. Learn Express deeply and the concepts transfer.

## Why it exists — the pain inventory it erases

Direct mapping from our raw-Node server (Step 1.4) to Express:

| Raw Node (we wrote this) | Express |
|---|---|
| `if (method === 'GET' && url === '/tasks')` chains | `app.get('/tasks', handler)` |
| no URL patterns — manual string parsing for `/tasks/42` | `app.get('/tasks/:id', ...)` → `req.params.id` (Phase 3) |
| buffer chunks → concat → `JSON.parse` → try/catch | `app.use(express.json())` → `req.body` |
| `res.writeHead(200, {'Content-Type': 'application/json'})` + `JSON.stringify` + `res.end` | `res.json(data)` |
| status boilerplate | `res.status(201).json(...)` |
| hand-written 404 fallback | trailing `app.use` fallback (customizable) |
| cross-cutting logic copy-pasted into every branch | middleware pipeline (Phase 5) |

## How it works internally — the middleware stack

Every `app.use(...)` / `app.get(...)` / `app.post(...)` call **appends a layer to
an internal array** (the router stack). A request walks the array top to bottom:

```
            request: POST /tasks
                    │
   ┌────────────────▼─────────────────┐
   │ layer 1: express.json()          │  matches all paths → runs, parses body,
   │          (added by app.use)      │  calls next() → continue down the stack
   ├──────────────────────────────────┤
   │ layer 2: GET /                   │  method mismatch → skipped
   ├──────────────────────────────────┤
   │ layer 3: GET /tasks              │  method mismatch → skipped
   ├──────────────────────────────────┤
   │ layer 4: POST /tasks             │  MATCH → handler runs, sends response,
   │                                  │  does not call next() → walk ends
   ├──────────────────────────────────┤
   │ layer 5: 404 fallback (app.use)  │  never reached for this request
   └──────────────────────────────────┘
```

Consequences you can reason from this model alone:

1. **Registration order is execution order.** `express.json()` must be registered
   before routes that need `req.body`; the 404 fallback must be registered last.
2. **A layer either responds or passes on** (`next()` — Phase 5 covers this
   contract in full). Route handlers typically respond; middleware typically
   passes on.
3. **404 isn't special** — it's simply "the request walked the whole stack and no
   one responded"; the trailing catch-all `app.use` is where you decide what that
   looks like.

## The API surface we use so far

### `express.json()` — body parsing as middleware

Returns a middleware function that: checks `Content-Type: application/json` →
consumes the body stream (the `on('data')/on('end')` dance from Step 1.4) →
`JSON.parse` → assigns to `req.body` → `next()`. If the JSON is malformed it
**forwards an error** instead — which lands in Express's error handling.

Observed behavior (real capture): sending broken JSON to our server returned
**400 with an HTML page containing a full stack trace** — Express's *default*
error handler, fine for development, unacceptable for production (it leaks file
paths and internals). Phase 7 replaces it with a JSON-speaking error middleware.
Until then, remember: we have not written error handling; we are borrowing a
default.

Note: `req.body` is typed loosely by `@types/express` — treat it as `unknown`
until validated (see [25-TypeScript.md](25-TypeScript.md), boundary rule).

### Response helpers

- `res.send(x)` — flexible: strings become `text/html`, objects become JSON,
  sets `Content-Length`, `ETag`, etc.
- `res.json(x)` — explicit JSON: serializes and sets
  `Content-Type: application/json`. **Prefer this in an API** — says what it means.
- `res.status(code)` — sets the status, returns `res` for chaining:
  `res.status(201).json(task)`.

Headers Express added on its own (from our live capture): `ETag` (cache
fingerprint), `Content-Length`, and `X-Powered-By: Express` — the last one
advertises the stack to attackers and is disabled in production
(`app.disable('x-powered-by')`; part of our production hardening later).

### The app/server split

```
src/app.ts     builds & exports the app   (routes, middleware — the LOGIC)
src/server.ts  imports app, .listen(PORT) (the PROCESS — network, lifecycle)
```

Why bother, for two tiny files?

1. **Testing (the big one, Phase 12):** Supertest drives the exported `app`
   directly — no port, no network, parallel-safe. If `app.ts` called `listen`,
   importing it in a test would hijack a port as a side effect.
2. **Separation of concerns:** "what the API does" vs "how the process runs"
   (port choice, and later: graceful shutdown, clustering). Different reasons to
   change → different files.
3. **Import purity:** importing a module should *define* things, not *do* things
   (side effects on import are a classic source of tangled systems).

## Common mistakes

1. Registering `express.json()` after routes → `req.body` undefined in them.
2. Registering the 404 fallback before routes → everything 404s (order is law).
3. Responding twice in one handler (`res.json(...)` then falling through to
   another `res.send`) → `ERR_HTTP_HEADERS_SENT`, same crash as raw Node.
4. Calling `listen` inside `app.ts` → tests can't import the app cleanly.
5. Shipping the default error handler to production → stack traces leak to
   clients (we saw the exact HTML).
6. Trusting `req.body` — parsed ≠ valid. Parsing checks syntax; validation
   (Phase 6) checks meaning.

## Best practices

- Fixed middleware order: parsers → routes → 404 → error handler (the full
  pipeline assembles over Phases 5–7).
- `res.status(...).json(...)` everywhere in an API; never bare `send` for data.
- `app.ts` exports; `server.ts` listens; nothing else touches the network.
- Disable `x-powered-by` in production hardening.

## Interview questions

1. **What is Express, relative to Node's http module?** A routing + middleware
   layer over `http.createServer`; `app` itself is the request-handler callback.
2. **Why does middleware order matter?** The router stack executes in
   registration order; a request walks it until something responds.
3. **What does `express.json()` actually do?** Content-type-gated middleware that
   consumes the body stream, parses JSON onto `req.body`, and forwards parse
   failures to error handling.
4. **Why separate app from server?** Testability (drive the app without a
   network), separation of concerns, side-effect-free imports.
5. **`res.send` vs `res.json`?** Both can emit JSON; `res.json` is explicit about
   intent and content type — the API convention.
6. **What changed in Express 5 that matters?** Handlers returning rejected
   promises route the error to error middleware automatically — async error
   handling without manual wrappers (details in Phase 7).

## Summary

Express is structure, not magic: `app` is the same `(req, res)` callback we wrote
by hand, wrapping an ordered middleware stack that each request walks until
something responds. `express.json()` replaced our stream-parsing; `res.json()`
replaced our serialize-and-label chores; the app/server split keeps logic
testable and the process concerns isolated. Order of registration is the law the
whole pipeline lives by.

## Further reading

- Express docs — https://expressjs.com (guide → "Using middleware")
- Express 5 migration notes — https://expressjs.com/en/guide/migrating-5.html
