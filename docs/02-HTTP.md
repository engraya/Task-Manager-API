# 02 — HTTP: The Protocol Everything Speaks

## Definition

**HTTP (HyperText Transfer Protocol)** is a text-based, request–response protocol:
a client sends one structured message (the request), the server answers with one
structured message (the response). Every REST API, every web page, every `fetch()`
call is this exchange repeated.

Two properties define its character:

- **Stateless** — each request stands alone; the protocol carries no memory of
  previous requests. Any continuity (logins, sessions) must be layered on top by
  applications (headers, tokens, cookies).
- **Textual** (HTTP/1.1) — requests and responses are human-readable text. You can
  read the entire protocol off the wire, which is exactly what we did with `curl -i`.

## History

- **1991, HTTP/0.9** — one line: `GET /page.html`. No headers, no status codes.
- **1996, HTTP/1.0** — headers, status codes, methods. One TCP connection per request.
- **1997, HTTP/1.1** — the 25-year workhorse: persistent connections
  (`Connection: keep-alive` — reuse the TCP connection), chunked transfer, `Host`
  header (many sites per IP). This is what our Node server speaks.
- **2015, HTTP/2** — binary framing, multiplexing (many requests in flight on one
  connection). Same semantics — methods/status/headers unchanged.
- **2022, HTTP/3** — runs on QUIC (UDP) instead of TCP; faster handshakes, better
  on lossy networks. Semantics unchanged again.

Lesson of the history: **the semantics (methods, status codes, headers) have been
stable for ~30 years.** Learn them once, use them forever; the transport keeps
evolving underneath without breaking the model.

## Anatomy of a request

```
POST /tasks HTTP/1.1                      ← request line: METHOD PATH VERSION
Host: localhost:3000                      ← headers: Key: Value pairs
Content-Type: application/json                (metadata about the request/body)
Content-Length: 38
Accept: application/json
                                          ← blank line = end of headers
{"title":"Buy milk","priority":"high"}    ← body (optional; GET usually has none)
```

- **Method** — the verb: what the client wants done (table below).
- **Path** — which resource: `/tasks`, `/tasks/42`. May carry a **query string**
  (`/tasks?completed=true&sort=dueDate`) — key-value refinements that do not
  change *which* resource, only *how* it's presented (filtering, sorting, paging).
- **Headers** — metadata. The client describes the body (`Content-Type`,
  `Content-Length`), states preferences (`Accept`), identifies itself
  (`User-Agent`), and later authenticates (`Authorization` — Phase 10).
- **Body** — the payload. JSON for us, always labeled by `Content-Type`.

## Anatomy of a response (real capture from our server)

```
HTTP/1.1 201 Created                      ← status line: VERSION CODE REASON
X-Powered-By: Express                     ← headers
Content-Type: application/json; charset=utf-8
Content-Length: 51
ETag: W/"33-QT7D2a00nE13RcWVAOIc3G82s20"
Date: Sat, 18 Jul 2026 13:22:58 GMT
Connection: keep-alive
                                          ← blank line
{"received":{"title":"Buy milk","priority":"high"}}
```

Headers worth knowing from this capture:

- `Content-Type` — how to interpret the body bytes. `application/json` is our
  API's native tongue.
- `Content-Length` — body size in bytes; lets the client know when the message
  ends. (Alternative: `Transfer-Encoding: chunked`, which our raw-Node server
  used because it never declared a length.)
- `ETag` — a fingerprint of the body, enabling conditional requests
  (`If-None-Match`) → `304 Not Modified` cache responses. Express computes it
  automatically.
- `Connection: keep-alive` — the TCP connection stays open for the next request.
- `X-Powered-By: Express` — advertisement of our stack. **Production practice is
  to disable it** (helps attackers fingerprint your server); we will.

## Methods — the verb table

| Method | Meaning | Body? | **Safe?** | **Idempotent?** | In our API |
|---|---|---|---|---|---|
| GET | read a resource | no | ✅ | ✅ | fetch tasks |
| POST | create / act | yes | ❌ | ❌ | create a task |
| PUT | replace entirely | yes | ❌ | ✅ | (we'll prefer PATCH) |
| PATCH | modify partially | yes | ❌ | ❌* | update a task |
| DELETE | remove | no | ❌ | ✅ | delete a task |
| OPTIONS | ask capabilities | no | ✅ | ✅ | CORS preflight (browsers send these for you) |
| HEAD | GET without body | no | ✅ | ✅ | health checks/caching |

Two definitions interviewers love, and that real systems depend on:

- **Safe** = the request does not change server state. Safe requests can be
  cached, prefetched, retried blindly. A GET that deletes something is a
  protocol violation that *will* eventually be triggered by a crawler or prefetcher.
- **Idempotent** = doing it N times has the same effect as doing it once.
  `DELETE /tasks/42` twice → still deleted (second returns 404; the *state* is
  identical). `POST /tasks` twice → **two tasks**. This is why network retry logic
  can safely repeat DELETE/PUT but must be careful with POST — the source of
  every "I was charged twice" bug you've read about.
  (*PATCH is idempotent for "set field" patches like ours, but not guaranteed in general.*)

## Status codes — the classes

First digit = class; memorize the classes, then the ~10 codes that matter:

```
1xx  informational   (rare in APIs)
2xx  success         "you asked, it worked"
3xx  redirection     "look elsewhere / use your cache"
4xx  client error    "YOUR request is wrong — fix it and retry"
5xx  server error    "OUR code/infrastructure broke — not your fault"
```

| Code | Name | We use it for |
|---|---|---|
| 200 | OK | successful GET/PATCH |
| 201 | Created | successful POST that created a resource |
| 204 | No Content | successful DELETE (nothing to say back) |
| 400 | Bad Request | malformed input (broken JSON, bad types) |
| 401 | Unauthorized | not authenticated — who are you? (Phase 10) |
| 403 | Forbidden | authenticated but not allowed (Phase 11) |
| 404 | Not Found | no such resource/route |
| 409 | Conflict | request conflicts with current state (duplicate, versioning) |
| 422 | Unprocessable Entity | syntactically fine, semantically invalid (validation — Phase 6) |
| 500 | Internal Server Error | unhandled failure in our code (Phase 7 makes these rare and clean) |

The 4xx/5xx boundary is a **blame line** and drives real behavior: clients should
fix-and-retry on 4xx, while monitoring systems page engineers on 5xx spikes.
Returning 500 for a user's typo sends false alarms; returning 200 with
`{"error": ...}` inside breaks every client and cache that trusts the status line.
**The status code is part of the API contract.**

## Statelessness — the constraint that scales

HTTP servers do not remember you between requests. Consequences:

- Every request must carry everything needed to process it (later: your auth token
  on *every* call — Phase 10).
- Any server instance can handle any request → load balancers can spray traffic
  across N identical processes → horizontal scaling works. This pairs exactly with
  Node's one-process-per-core model from [04-NodeJS.md](04-NodeJS.md).
- State lives in databases, not process memory (Phases 8–9).

```
            ┌──────────────┐         ┌────────────┐
  client ──►│ load balancer│──┬─────►│ node proc 1│──┐
            └──────────────┘  ├─────►│ node proc 2│──┼──► database
     any request can land     └─────►│ node proc 3│──┘    (the state)
     on any process ────────────────►└────────────┘
```

## Production use

- APIs version their contract (`/api/v1/...`) because clients depend on exact
  shapes and codes.
- Caching infrastructure (CDNs, browser caches) keys off methods and headers —
  safe methods + ETags/Cache-Control make whole classes of requests free.
- HTTPS (HTTP over TLS) is mandatory in production — same protocol, encrypted
  transport; port 443 instead of 80. Deployment platforms terminate TLS for you
  (Phase 14).

## Common mistakes

1. Tunneling everything through POST (`POST /getTasks`) — throws away caching,
   retries, semantics, and reviewer goodwill.
2. Returning 200 with an error in the body — breaks the contract; clients and
   monitors read the status line first.
3. Wrong idempotency assumptions — retrying a POST on timeout without
   deduplication → duplicated resources/charges.
4. Ignoring `Content-Type` — sending JSON without the header (parsers skip the
   body) or trusting the body to match the label (validate!).
5. Using 500 as a catch-all for client mistakes — pages the on-call for typos.

## Interview questions

1. **Safe vs idempotent?** Safe = no state change (GET); idempotent = repeatable
   without additional effect (GET, PUT, DELETE). Every safe method is idempotent;
   not vice versa.
2. **Why is POST not idempotent and what's the consequence?** Each POST may create
   a new resource; naive retries duplicate. Mitigations: idempotency keys, dedup.
3. **What does statelessness buy?** Horizontal scalability — any instance can
   serve any request; state is externalized to databases.
4. **200 vs 201 vs 204?** OK with body / resource created (with the new resource
   returned) / success with deliberately empty body (DELETE).
5. **400 vs 422?** 400: request malformed (can't even parse). 422: parseable but
   semantically invalid (fails validation rules). Teams sometimes collapse both
   into 400 — the key is consistency within the API.
6. **What is an ETag?** A body fingerprint enabling conditional requests and
   cheap 304 cache validation.

## Summary

HTTP is stateless request/response text: method + path + headers + optional body
in; status + headers + body out. Methods carry semantics (safety, idempotency)
that caching, retries, and scaling infrastructure rely on; status codes are a
blame-line contract (2xx ours-good, 4xx yours, 5xx ours-bad). Statelessness is
the price and the recipe for horizontal scale. Our entire API is a disciplined
application of this vocabulary.

## Further reading

- MDN HTTP guide — https://developer.mozilla.org/en-US/docs/Web/HTTP
- RFC 9110 "HTTP Semantics" (2022) — the current authoritative spec, surprisingly readable
- MDN status code reference — https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
