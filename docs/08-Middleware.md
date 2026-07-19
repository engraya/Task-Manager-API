# 08 — Middleware

## Definition

**Middleware is a function with the signature `(req, res, next)` that sits in
the request pipeline.** Each middleware receives every matching request and
makes one decision: do its work, then either

- **`next()`** — pass the request to the next layer in the stack, or
- **respond** (`res.json(...)` etc.) — end the walk here, or
- **`next(err)`** — declare failure and jump to error middleware (Phase 7).

Everything in Express is middleware. Route handlers are just middleware that
usually respond instead of passing on; the "stack walk" from
[05-Express.md](05-Express.md) is a chain of these functions.

```
request ─► [ logger ] ─► [ json parser ] ─► [ router/handler ] ─► response
             next()          next()             res.json()
              │                │
              └── each link decides: pass on, respond, or fail
```

## History

Express inherited the model from **Connect** (2010), which modeled a server
as a stack of composable request transformers — itself echoing Rack (Ruby)
and WSGI (Python). The idea is older than all of them: it's the
**chain-of-responsibility** pattern, specialized for HTTP.

## Why it exists — cross-cutting concerns

Some behavior belongs to *every* request, not to any one route: logging,
body parsing, authentication, CORS headers, rate limiting, compression.
Without a pipeline you'd copy that code into every handler (and forget it in
one — the bug is always in the forgotten one). Middleware states it once, at
the pipeline position where it belongs:

| Concern | Middleware | Phase |
|---|---|---|
| observe traffic | `requestLogger` (ours) | 5 |
| parse JSON bodies | `express.json()` | 1 |
| validate input | validator middleware | 6 |
| translate errors | error middleware | 7 |
| identify the user | auth middleware | 10 |

## `next()` — the mechanics

`next` is a callback into Express's dispatcher: "this layer is done; run the
next matching layer." Three rules cover almost every bug:

1. **Not calling `next()` and not responding = the request hangs.** The walk
   stops with nobody answering; the client waits until timeout. (The classic
   symptom: "the API just spins on every request" → some middleware forgot
   `next()`.)
2. **Calling `next()` after responding = double-answer risk.** The walk
   continues into layers that may also respond (`ERR_HTTP_HEADERS_SENT`).
   Respond *or* pass on, not both. (`return next()` is a common idiom to
   make the "we're done here" explicit.)
3. **`next(err)` skips all normal layers** and goes straight to error
   middleware — the escape hatch Phase 7 builds on.

## Ordering — position is policy

The stack runs in registration order, so *where* a middleware sits defines
what it sees:

```
app.use(requestLogger);     // 1st: sees EVERYTHING, even parse failures & 404s
app.use(express.json());    // 2nd: bodies exist from here on
app.use('/api/v1/tasks', tasksRouter);
app.use(notFoundFallback);  // last normal layer
// (Phase 7: error middleware after everything)
```

Our logger is first *deliberately*: registered later, it would miss requests
that die in earlier layers (a malformed-JSON request never reaches anything
after `express.json()`). Auth middleware (Phase 10) will sit after parsing
but before routes — position is policy, chosen per concern.

## Case study: our request logger

```ts
export const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${elapsedMs.toFixed(1)} ms)`);
  });
  next();
};
```

Three techniques worth naming:

- **Subscribe now, log later.** The middleware runs *before* the handler, but
  status and duration exist only *after* the response. `res.on('finish')`
  (fires when the last byte reaches the kernel — [13-Response-Lifecycle.md](13-Response-Lifecycle.md))
  bridges the gap. This before/after sandwich — do something on the way in,
  observe on the way out — is the standard shape for metrics, timing, and
  audit middleware.
- **Monotonic time.** `process.hrtime.bigint()` only moves forward; wall
  clocks (`Date.now()`) jump on NTP sync/DST and produce negative durations
  in logs at 2 AM twice a year. Durations: monotonic clock. Timestamps: wall
  clock.
- **Observers don't decide.** The logger always calls `next()`, mutates
  nothing, responds never. Keeping observation side-effect-free means it can
  never *cause* an outage it would have observed.

Real output (first run of a fresh process):

```
GET  /api/v1/tasks -> 200 (23.7 ms)     ← V8 still JIT-compiling: cold
POST /api/v1/tasks -> 201 (140.4 ms)    ← coldest: first body-parse path
GET  /api/v1/tasks/4a2c… -> 200 (3.1 ms)  ← warm
GET  /nope -> 404 (1.0 ms)              ← logger sees 404s: position pays
```

The warm-up effect is real and normal — JIT-compiled languages are slow for
the first executions of each code path. Production means: never benchmark a
cold process.

## Third-party middleware you'll meet

- `helmet` — sets security headers (and removes `X-Powered-By`) — planned
- `cors` — cross-origin headers, needed the day a browser frontend calls us
- `morgan`/`pino-http` — production-grade versions of our logger (Phase 13)
- `express-rate-limit` — throttling per client

Each is just a `(req, res, next)` function configured by a factory call —
exactly the shape we wrote by hand.

## Common mistakes

1. Forgetting `next()` — silent hang, the signature middleware bug.
2. `next()` after responding — double-answer crash.
3. Registration order contradicting intent (logger after routes, parser
   after routes).
4. Heavy synchronous work in middleware — it runs for EVERY request; the
   event-loop rules apply with maximal leverage.
5. Mutating req/res casually — later layers inherit your surprises; if you
   must attach data (auth will), do it deliberately and type it.

## Interview questions

1. **What is middleware and what can it do with a request?** `(req, res,
   next)`; pass on, respond, or fail into error handling.
2. **What happens if middleware neither responds nor calls next?** The
   request hangs until client timeout — no error anywhere server-side.
3. **Why does middleware order matter? Give a concrete bug.** Stack runs in
   registration order; a logger after the router misses 404s and parse
   failures; a parser after routes leaves `req.body` undefined.
4. **How can a middleware act after the response it never sees being sent?**
   Subscribe to `res` lifecycle events (`finish`) before passing the request
   on.
5. **Why monotonic time for durations?** Wall clocks jump (NTP/DST);
   `hrtime` can't, so durations are always non-negative and honest.

## Summary

Middleware is the pipeline's unit: `(req, res, next)`, one decision — pass,
respond, or fail. Cross-cutting concerns get stated once at the right
position, and position is policy (our logger sits first so nothing escapes
it). The logger demonstrated the observe-on-the-way-out sandwich, monotonic
timing, and the observer principle. The pipeline is now: logger → parser →
routes → 404 — with two seats reserved: validators (Phase 6) and the error
handler (Phase 7).

## Further reading

- Express guide: Using middleware — https://expressjs.com/en/guide/using-middleware.html
- Express guide: Writing middleware — https://expressjs.com/en/guide/writing-middleware.html
