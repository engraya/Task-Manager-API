# 13 — The Response Lifecycle (Outbound)

## Definition

The response lifecycle is everything between our handler deciding to respond
(`res.status(201).json(task)`) and the client's `fetch` promise resolving.
It mirrors the inbound journey ([12-Request-Lifecycle.md](12-Request-Lifecycle.md))
in reverse — with one property that explains a whole class of bugs:
**a response is written in irreversible stages.**

## The journey

```
OUR HANDLER
  │ 1. res.status(201).json(task)
  ▼
EXPRESS (res helpers)
  │ 2. serialize: JSON.stringify(task)
  │ 3. assemble headers: Content-Type, Content-Length, ETag…
  ▼
NODE ServerResponse
  │ 4. write status line + headers to the socket   ← POINT OF NO RETURN
  │ 5. write body bytes
  │ 6. end the response (keep-alive: connection stays open)
  ▼
OS / NETWORK
  │ 7. kernel send buffer → TCP segments → routed to client
  ▼
CLIENT
  │ 8. parses status line + headers (fetch resolves HERE)
  │ 9. streams body (await res.json() completes here)
  ▼
EVENT LOOP: back to poll phase — next request, same process
```

## Stage by stage

### 1–2 · Helper sugar, then serialization

`res.json(task)` = `JSON.stringify` + `Content-Type: application/json` +
send. Serialization is **synchronous CPU work on the event-loop thread** —
trivial for a task object, real for megabyte payloads
([04-NodeJS.md](04-NodeJS.md): don't block the loop). Giant responses are a
server health issue, not just a client one — another argument for pagination
(Phase 9).

### 3 · Header assembly — what Express adds

From our live capture, we wrote `status(201)` + one JSON object; the wire
carried six headers:

```
HTTP/1.1 201 Created
X-Powered-By: Express                          ← framework ad (we'll disable)
Content-Type: application/json; charset=utf-8  ← res.json set this
Content-Length: 33                             ← body size, computed
ETag: W/"21-uFSAl7Vu8XCgSTQnG9965MbjgsU"       ← content fingerprint, computed
Date: Sat, 18 Jul 2026 20:17:02 GMT            ← required by HTTP spec
Connection: keep-alive                         ← reuse the TCP connection
```

`Content-Length` is why buffered responses are simple: the size is known
before sending. (Streamed responses use `Transfer-Encoding: chunked` — our
raw-Node server did, because it never declared a length.)

### 4 · The point of no return

The status line travels **first**, then headers, then body. Once flushed to
the socket, they are physically on the wire — there is no unsending. This is
the mechanical truth behind:

- `ERR_HTTP_HEADERS_SENT` — a second `res.json()`/`writeHead` has nothing
  valid to do; the first bytes already left.
- **Why late errors are awkward**: if serialization of item 900 of 1000 fails
  mid-stream, the 200 status is already gone — you can't turn it into a 500.
  Error handling (Phase 7) must decide *before* the first byte.
- `res.headersSent` — the boolean guard Express's own error handler checks
  before attempting a response.

### 5–7 · Down the stack

Node hands bytes to the kernel's send buffer (non-blocking — `res.end()`
returns before the client has anything); the kernel packetizes into TCP
segments, handles acknowledgment and retransmission. Node is done with the
request the moment the bytes are buffered; the event loop is already free.

### 6 & keep-alive · The connection outlives the response

`Connection: keep-alive` + curl's `* Connection #0 to host localhost:3000
left intact`: the TCP connection stays open (Node default: 5s idle,
`Keep-Alive: timeout=5`) so the next request skips the handshake. Response
done ≠ connection closed.

### 8–9 · The client's two-phase receive

`fetch()` resolves when **headers** arrive — before the body. That's why the
API is two awaits: `const r = await fetch(...)` (status/headers ready), then
`await r.json()` (body fully streamed + parsed). The response lifecycle's
headers-first nature is visible in the client API you already use daily.

## After the response: the loop turns

Our handler returned; the event loop re-enters poll. **The same process,
same memory, immediately serves the next request** — which is why in-memory
state is fragile (Phase 8 makes this concrete) and why one slow synchronous
handler delays every queued response. A request is a *visit*, not a session.

## Production use

- **Time-to-first-byte (TTFB)** — the metric dashboards track — is precisely
  "inbound lifecycle + handler + stages 1–4."
- **Response logging middleware** (Phase 13) hooks the `finish` event on
  `res` to record status + duration after stage 6 — measuring the true cost.
- **Compression middleware** (gzip/brotli) slots between serialization and
  the socket — CPU-for-bandwidth, typically at the reverse proxy in
  production.

## Common mistakes

1. Responding twice — `ERR_HTTP_HEADERS_SENT`; every code path must respond
   exactly once and `return`.
2. Trying to change the status after streaming began — decide before byte one.
3. Serializing huge payloads on the loop — blocks everyone; paginate.
4. Assuming `res.end()`/`res.json()` means the client received it — it means
   the kernel accepted the bytes.
5. Treating `fetch`'s resolve as "body ready" — headers only; `await .json()`
   is the body.

## Interview questions

1. **What happens, in order, when you call `res.json(obj)`?** Serialize →
   set content headers → write status line + headers → write body → end;
   kernel/TCP take it from there.
2. **Why can't you change a status code after starting to send?** The status
   line is the first bytes on the wire; HTTP has no revision mechanism.
3. **What does `fetch()` resolving actually mean?** Headers received; the
   body streams afterward (`await res.json()`).
4. **What is `res.headersSent` for?** Guarding late-error paths: if true, the
   response is partially sent and error middleware must not attempt a fresh one.
5. **When is Node "done" with a response?** When bytes reach the kernel send
   buffer — delivery is TCP's job; the loop moves on immediately.

## Summary

A response is staged, ordered, and irreversible: serialize → headers →
status-line-first write → body → end, with the kernel and TCP finishing
delivery while the event loop already serves the next request. Headers travel
first on both ends — the server can't unsay them, and the client's `fetch`
resolves on them. Respond once, decide status before byte one, keep payloads
bounded — and the connection, thanks to keep-alive, lives on after the
response ends.

## Further reading

- Node docs: `ServerResponse` events (`finish`, `close`) — the logging hooks
- MDN: `Response.body` streaming — the client-side mirror of all this
