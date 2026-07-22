# Logging

## Definition

**Logging** is the app's running commentary on what it's doing — a stream of
timestamped, severity-tagged records emitted as it handles work. Done well, logs
are the primary tool for answering "what happened?" after the fact, especially
when something broke on a server nobody was watching.

This project uses **pino**: a fast, JSON-first structured logger, prettified in
development and emitting raw JSON in production, with per-request correlation
ids.

## Why `console.log` is not logging

`console.log` writes an unstructured string to stdout. Fine when you're the only
reader watching a terminal; useless once the app runs unattended at scale.
Structured logging adds the three things production needs:

1. **Levels (severity)** — `fatal > error > warn > info > debug > trace`. A level
   is a threshold: emit this level and above, drop the rest. One dial trades
   verbosity for cost — `debug` while building, `info` in production.
2. **Structure** — one JSON object per line (`{ level, time, msg, ...fields }`),
   so log aggregators (Datadog, CloudWatch, Loki, Splunk) parse, index, and let
   you *query by field*: "every error for `userId` X in the last hour." You
   can't query a sentence.
3. **Redaction** — declare sensitive field names once; the logger censors them
   wherever they appear. Logs are the classic accidental-leak channel.

**The message is for humans; the fields are for machines** — and in production
the machines read first.

## Levels

| Level | Meaning | Example here |
|---|---|---|
| `fatal` | process is dying | startup failure in `server.ts` |
| `error` | a bug we survived (500) | unhandled error in the error handler |
| `warn` | noteworthy, not fatal | a 4xx response (client error) |
| `info` | routine lifecycle/events | "Server listening", a 2xx request |
| `debug` | detail for development | "request received" |
| `trace` | very fine-grained | (unused) |

Default level is **`info` in production**, **`debug` in development**, and
**`silent` in tests** (the log code still runs — so its paths are exercised —
but nothing prints). Override with the `LOG_LEVEL` env var.

## Structure: one logger, configured once

`src/logger.ts` is the single shared logger. Logging policy — format, level,
destination, redaction — is **cross-cutting**: it must be uniform across the app
or the aggregator gets an unparseable mess. Centralizing means one place to
change when a redaction path or a log sink is added. Same instinct as the single
`config` module and the single error handler.

```ts
export const logger = pino({
  level: config.logLevel,
  redact: { paths: ['password', '*.password', 'passwordHash', '*.passwordHash',
                     'req.headers.authorization', 'token', '*.token'],
            censor: '[redacted]' },
  ...(dev ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
});
```

**Never pretty-print in production** — it's slower on the hot path and destroys
the JSON structure aggregators depend on. Pretty is a development convenience;
production emits raw JSON straight to stdout, the fastest path.

### The `err` serializer

`logger.error({ err }, 'msg')` — the `err` key triggers pino's error serializer,
which records `{ type, message, stack }` as structured fields. Compared to
`console.error(err)`'s multi-line string dump, this is queryable: "how many
`TypeError`s last hour" becomes a filter on `err.type`.

## Correlation ids — following one request

The highest-leverage observability feature, per line of code. In production your
logs are a firehose — thousands of interleaved lines from hundreds of concurrent
requests. A single error line is a word torn from a book: you can't see what its
request did before it failed.

A **correlation id** (request id / trace id) fixes this: one id, generated when a
request arrives, stamped on *every* log line that request produces. Query
`reqId: "abc-123"` and you get that request's whole story, in order, isolated
from the noise.

```
request received   reqId=abc  GET /api/v1/tasks
task created        reqId=abc  taskId=...
request completed  reqId=abc  status=201  durationMs=12.3
```

### The mechanism: child loggers

```ts
const reqId = incomingHeaderId ?? randomUUID();   // reuse upstream id if present
req.log = logger.child({ reqId });                // stamps reqId on every line
res.setHeader('X-Request-Id', reqId);             // echo back to the client
```

A **child logger** inherits the parent's config but permanently adds `{ reqId }`
to every line logged through it — so no log call repeats the id. Handing
`req.log` to controllers/services lets any layer log with the id riding along.
It's the observability twin of Phase 11's "attach context at the boundary,
inherit downstream."

### Spanning services

`requestLogger` **reuses** an incoming `X-Request-Id` header if present, minting
one only when absent. In a distributed system the gateway generates the id and
each service passes it on, so one user action is traceable across the *entire*
system — the foundation distributed tracing (OpenTelemetry, Jaeger, Zipkin)
builds on. Echoing the id in the response header lets a client or support ticket
quote the exact failing request.

### Level from status — self-sorting logs

```ts
const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
```

The completion line's severity comes from the response status, so a query for
`level >= warn` surfaces exactly the problem responses with no status
enumeration. `request received` logs at `debug` so production (level `info`) gets
one line per request; development sees both.

## Application logging vs. CLI output

Not every `console.log` is wrong. The **application** (request handlers, startup,
errors) logs through pino — it runs unattended and its output is consumed by
machines. The **CLI scripts** (`seed`, `migrate:orphans`) use `console.log`
deliberately: they're interactive tools a human runs and reads directly, where
progress lines and prompts *are* the interface, not telemetry. Match the tool to
the audience: pino for the server, console for the human at a terminal.

## Production concerns

- **Log to stdout, not files** — in containers, the platform (Docker, k8s,
  Heroku) captures stdout and ships it to the aggregator. The app shouldn't own
  file rotation; that's infrastructure's job.
- **Sampling / rate-limiting** — extremely high-traffic services sample logs to
  control cost; know the option exists.
- **Retention & PII** — logs are stored and replicated; redaction plus not
  logging personal data keeps you compliant and safe.
- **Don't log on the hot path more than needed** — logging isn't free; one
  structured line per request is the sweet spot.

## Common mistakes

1. `console.log` in application code — no levels, structure, or redaction.
2. Pretty-printing in production — slow and unparseable.
3. Interpolating data into the message (`` `user ${id}` ``) — unqueryable; pass
   fields.
4. Logging whole request/user objects without redaction — the classic leak.
5. No correlation id — logs become an ungroupable firehose.
6. Always minting, never reusing `X-Request-Id` — breaks cross-service tracing.
7. Flat level for all requests — can't filter for failures; derive from status.
8. A logger per file with divergent config — breaks aggregation.

## Interview questions

1. **Structured logging vs. `console.log`?** Levels, queryable structure, and
   central redaction; aggregators consume JSON.
2. **Why never pretty-print in production?** Slower hot path, destroys machine
   structure; pretty is dev-only.
3. **What is a correlation id and what does it solve?** One id per request
   stamped on every line, so you can pull a request's whole story from
   interleaved logs.
4. **Why reuse an incoming request id?** So it spans services — trace one action
   across a distributed system; basis of distributed tracing.
5. **What's a child logger?** Inherits parent config, adds fixed fields (the
   `reqId`) to every line — attach context once, inherit everywhere.
6. **How do you make failed requests easy to find?** Derive log level from the
   response status; filter `level >= warn`.
7. **Where should logs go in a containerized app?** stdout — the platform
   captures and ships them; the app doesn't manage files.

## Summary

Logging is how the app explains itself after the fact. `console.log` isn't
logging once nobody's watching: production needs **levels** (verbosity vs. cost),
**structure** (query by field), and **redaction** (no leaks). pino delivers all
three, JSON in production and pretty in development, from one shared module. The
crown feature is the **correlation id** — one id per request, carried by a child
logger onto every line, reused across services, echoed to the client — which
turns an ungroupable firehose into followable threads and is how real incident
debugging works. Completion lines self-sort by status-derived level; CLI scripts
keep `console.log` because their audience is a human, not a machine.

## Further reading

- pino docs — child loggers, serializers, redaction, transports
- OpenTelemetry — distributed tracing, the industrial-scale version of
  correlation ids
- The Twelve-Factor App, factor XI "Logs" — treat logs as event streams to
  stdout
- OWASP Logging Cheat Sheet — what to log, what never to log
