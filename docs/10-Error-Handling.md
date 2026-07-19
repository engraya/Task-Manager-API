# 10 — Error Handling

## Definition

Error handling is the architecture that decides, for every failure in the
system: **what the client is told, what the engineers are told, and where
that decision lives.** In this project the answers are: the contract's
envelope with an honest status (client), everything including stack traces
via the server log (engineers), and *one place* — the error middleware —
(where).

## The central distinction: operational vs programmer errors

| | Operational | Programmer |
|---|---|---|
| What it is | expected failure of a healthy system | a bug |
| Examples | task not found, invalid input, bad credentials | undefined property read, broken invariant |
| Client gets | specific 4xx + safe message (+ details) | generic 500, nothing else |
| Engineers get | usually nothing special (it's normal traffic) | full error + stack in logs; ideally an alert |
| Representation | `AppError` subclasses carrying `statusCode` | anything else — **by definition** |
| Process should | continue | continue (Express context) but be observable |

The "by definition" cell is the security posture: an unrecognized error is
treated as a bug and reveals nothing. Allowlist (AppError) over blocklist.

## The architecture (as built, Phases 7.1–7.2)

```
throw sites (anywhere)                     the ONLY formatter
────────────────────────                   ─────────────────────────────
validateBody        → throw ValidationError ─┐
controllers         → throw NotFoundError ───┤
404 fallback        → throw NotFoundError ───┤    errorHandler (4 args, LAST layer)
express.json        → next(SyntaxError) ─────┼──► 1. headersSent? delegate & die
any bug             → throw / rejection ─────┘    2. body-parse SyntaxError → 400 envelope
                                                  3. AppError → its status + envelope
                                                  4. else: log fully → generic 500
```

Design consequences:

- **Throw sites decide, the handler transcribes.** `NotFoundError` knows it
  is a 404; no `if` about statuses exists outside the classes + handler.
- **Formatting exists once.** Change the envelope → one file changes.
- **The service stays HTTP-free** — it still returns `undefined`/`false`;
  the *controller* converts domain absence into `NotFoundError`. (A service
  may also throw domain errors; the layer rule is only that it never touches
  HTTP vocabulary.)

## How errors travel in Express

Express recognizes error middleware **by arity**: a 4-argument function
`(err, req, res, next)`. Three roads lead to it:

1. `next(err)` — explicit forwarding (how `express.json()` reports parse
   failures).
2. **Synchronous `throw`** in any handler/middleware — Express catches it.
3. **Rejected promises from async handlers — Express 5.** The headline v5
   change: `async (req, res) => { throw x }` lands in error middleware
   automatically.

### The Express 4 history you must recognize

In v4, road 3 didn't exist: an async rejection was lost (hanging request,
or process crash via unhandledRejection). Every v4 codebase therefore wraps
handlers:

```js
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
router.get('/', asyncHandler(async (req, res) => { ... }));
```

Know this wrapper on sight — you will meet it in production code and
interviews. In Express 5 it is obsolete; we proved it live (an async
rejection reached our handler unwrapped).

## Error class anatomy (src/errors/app-error.ts)

```ts
class AppError extends Error {
  readonly statusCode: number;
  readonly details?: ApiErrorDetail[];
  constructor(statusCode, message, details?) {
    super(message);
    this.name = new.target.name;              // logs as "NotFoundError:"
    Error.captureStackTrace(this, new.target); // stack starts at throw site
  }
}
```

- `new.target.name` — subclasses self-label in logs without repeating code.
- `captureStackTrace(this, new.target)` — trims constructor frames; the
  first stack line is the line that threw.
- Subclasses encode the contract: `NotFoundError` → 404,
  `ValidationError` → 422 + details. Adding auth (Phase 10) means adding
  `UnauthorizedError` (401) / `ForbiddenError` (403) — the pattern scales by
  subclassing.

## The handler's guards, in order

1. **`res.headersSent`** — if the status line already left, no correction is
   possible ([13-Response-Lifecycle.md](13-Response-Lifecycle.md));
   delegate to Express's default, which destroys the socket so the client
   knows the response is broken (a corrupted 200 would be worse).
2. **Known library errors** — body-parser's `SyntaxError{status:400}` gets
   re-dressed in the contract envelope (anti-corruption at the boundary).
3. **AppError** — transcribe.
4. **Default = bug** — `console.error(err)` (Phase 13: structured logger),
   generic 500. What 500 bodies never contain: stack traces, file paths,
   library names, raw error messages, anything a client could use to map
   internals. We verified this with a planted secret: visible in the server
   log, absent from the response.

## Production practices

- **Alert on 5xx, dashboard 4xx.** The operational/programmer split drives
  monitoring; miscategorization causes alert fatigue or silent breakage.
- **Correlation ids**: production 500s usually include a request id so a
  user report can be matched to the log line (pairs with the request-id
  middleware exercise from Phase 5).
- **Crash-only for truly unknown state**: some teams exit the process on
  programmer errors (fresh state beats corrupted state) under a supervisor
  that restarts it. In Express, per-request containment is the default;
  process-level `unhandledRejection`/`uncaughtException` hooks belong to
  deployment hardening (Phase 14).

## Common mistakes

1. try/catch-and-format in every controller — formatting scattered,
   envelopes drift. One boundary.
2. `res.json({ error: err.message })` for unknown errors — leaks by default.
3. Three-argument "error handler" — wrong arity, silently never runs as one.
4. Missing `headersSent` guard — the handler itself crashes mid-stream.
5. Using v4 wrappers in v5 (noise) or assuming v5 in v4 (lost rejections).
6. Swallowed errors (`catch {}`) — worse than loud failure.
7. Throwing strings (`throw 'nope'`) — no stack, no instanceof, breaks the
   whole taxonomy. Always `Error` subclasses.

## Interview questions

1. **Operational vs programmer errors — why does the split matter?**
   It decides status codes, response bodies, logging, and alerting; and the
   default direction (unknown = bug = reveal nothing) is the security
   posture.
2. **How does Express identify error middleware?** Four-argument signature;
   runs on `next(err)`, sync throw, or (v5) async rejection.
3. **What was asyncHandler and why is it obsolete?** v4 lost async
   rejections; the wrapper caught and forwarded them; v5 forwards natively.
4. **Why must the error handler check `res.headersSent`?** Mid-stream
   failures can't be re-answered; without the guard the handler double-sends
   and crashes.
5. **What belongs in a production 500 body?** Generic message (+ request
   id). Nothing that describes internals.
6. **Where should the decision "this is a 404" live?** At the throw site,
   encoded in the error type — the handler transcribes; it doesn't decide.

## Summary

Errors are typed values with owners: operational failures are AppError
subclasses that carry their own HTTP mapping and are thrown wherever they're
discovered; everything else is a bug by definition. One four-argument layer
at the pipeline's end turns all of it into contract envelopes — guarded
against irreversibility, translating known library errors, logging bugs
fully and revealing nothing. Express 5 delivers every flavor (explicit,
thrown, rejected) to that one place.

## Further reading

- Node.js docs: *Error handling* section of the guides (operational vs
  programmer errors originates here / Joyent's classic essay)
- Express docs: Error handling — https://expressjs.com/en/guide/error-handling.html
