# 12 — The Request Lifecycle (Inbound)

## Definition

The request lifecycle is everything that happens between a client deciding to
call the API and our handler function beginning to run. Understanding each
stage turns "it's slow" and "it hangs" from mysteries into a checklist of
places to look. (The return journey is [13-Response-Lifecycle.md](13-Response-Lifecycle.md).)

## The full journey

```
CLIENT (browser fetch / Postman / curl)
  │ 1. DNS: name → address
  │ 2. TCP: connection handshake        ─┐ transport
  │ 3. (TLS handshake — production)     ─┘ setup
  │ 4. HTTP request sent as text
  ▼
OPERATING SYSTEM (server side)
  │ 5. bytes land in the socket's kernel buffer
  ▼
LIBUV (event loop, poll phase)
  │ 6. "socket readable" → wakes Node
  ▼
NODE http MODULE
  │ 7. llhttp parses request text
  │ 8. creates req (IncomingMessage) + res (ServerResponse)
  │ 9. calls the createServer callback — WHICH IS the Express app
  ▼
EXPRESS
  │ 10. walks the layer stack in registration order
  │ 11. express.json() consumes the body stream, sets req.body
  │ 12. router matches method + path
  ▼
OUR HANDLER runs                        ← business logic starts here
```

## Stage by stage

### 1 · DNS — name to address

`localhost` → `::1` (IPv6 loopback) — visible in our live capture
(`Host localhost:3000 was resolved. IPv6: ::1`). For a real domain this is a
network lookup (cached at many layers). Measured on our machine: **0.0001s**
(local, cached); real-world DNS can be tens of milliseconds — one reason
clients reuse connections.

### 2 · TCP — the handshake

TCP gives both sides a reliable, ordered byte stream. Establishing it costs a
round trip (SYN → SYN-ACK → ACK):

```
client ── SYN ──────────► server
client ◄───── SYN-ACK ── server
client ── ACK ──────────► server     connection open (1 round trip)
```

Measured: **~0.001s** locally; across an ocean this is ~100ms+ *before any HTTP
happens* — which is why HTTP/1.1 keep-alive (reusing the connection) matters:
our second request skipped nothing but still shows the pattern — production
clients hold connections open precisely to amortize this cost.

### 3 · TLS (production only)

HTTPS adds an encryption handshake (more round trips; TLS 1.3 needs one).
Deployment platforms usually *terminate TLS* at the load balancer, so our Node
process still speaks plain HTTP internally (Phase 14).

### 4 · The request is text on the stream

Exactly what `curl -v`'s `>` lines showed:

```
POST /tasks HTTP/1.1
Host: localhost:3000
User-Agent: curl/8.20.0
Accept: */*
Content-Type: application/json
Content-Length: 20
                                  ← blank line: headers done
{"title":"Trace me"}              ← body bytes
```

### 5–6 · Kernel buffer → event loop

The OS accumulates arriving bytes in the socket's receive buffer. libuv,
sitting in the **poll phase** of the event loop
([04-NodeJS.md](04-NodeJS.md)), gets notified "this socket is readable" and
schedules the read — this is the non-blocking machinery: no thread ever sat
waiting on this socket.

### 7–9 · Node parses; Express is called

Node's HTTP parser (**llhttp**, a C library — parsing headers for every
request in JS would be too slow) incrementally consumes the text. The crucial
subtlety:

> **The `createServer` callback fires as soon as the HEADERS are parsed —
> the body may still be in flight.**

That's why the body is exposed as a stream (`req.on('data')` in our raw-Node
server) and why body parsing is inherently asynchronous. `req` wraps the
parsed request; `res` is an open writable stream back down the same TCP
connection; and the callback Node invokes is literally the Express `app`
function ([05-Express.md](05-Express.md)).

### 10–12 · The Express stack walk

For `POST /tasks` against our current app:

```
layer 1  express.json()   Content-Type matches → consume body stream,
                          JSON.parse, req.body = result, next()
layer 2  GET /            method mismatch → skip
layer 3  GET /health      path mismatch  → skip
layer 4  GET /tasks       method mismatch → skip
layer 5  POST /tasks      MATCH → handler runs
```

Only now — DNS, TCP, kernel, libuv, parser, five layers later — does "our
code" run. Everything before the handler is infrastructure we now understand
end to end.

## Timings from the live capture

| Phase | Measured (localhost) | Real-world scale |
|---|---|---|
| DNS | 0.0001s | 0–100ms (cached vs cold) |
| TCP connect | 0.001s | ~1 RTT (regional: 5–50ms; intercontinental: 100ms+) |
| First response byte | 0.005s | connect + server processing |
| Total | 0.005s | — |

The gap between *connect* and *firstbyte* (~4ms here) contains **everything
server-side**: parsing, the stack walk, our handler, serialization. When an
API is slow, comparing these numbers tells you immediately whether to blame
the network or the server.

## Production relevance

- **Latency budgets** are set per stage: p99 handler time, connection reuse
  rates, TLS resumption. The lifecycle *is* the checklist.
- **Timeouts exist at every stage** — connect timeout, header timeout
  (`server.headersTimeout`), body timeout, response timeout. "It hangs" always
  means *one specific stage* stalled.
- **Slowloris attacks** exploit stage 4–7: clients sending headers one byte
  a minute hold sockets open; Node's default header timeout (60s) is the
  defense.

## Common mistakes

1. Blaming "the server" for latency that timing breakdowns show is network/DNS.
2. Assuming the body exists when the handler starts — headers-first is why
   parsers are middleware and asynchronous.
3. Forgetting every stage needs a timeout — unbounded waits leak sockets.
4. Testing only on localhost and being surprised by real-world RTTs — 1ms
   connects hide design problems (chatty APIs) that 100ms connects expose.

## Interview questions

1. **Walk me through what happens when a client calls your API.** (The diagram
   above, spoken. Depth differentiates candidates — most stop at "the server
   receives it.")
2. **When does your handler actually start relative to the request arriving?**
   After headers parse; the body may still be streaming — body parsing is
   async middleware.
3. **Why does connection reuse matter?** TCP (+TLS) setup costs round trips;
   keep-alive amortizes it across requests.
4. **Where can a request "hang"?** Any stage: DNS, connect, TLS, sending
   headers/body, server processing, response — and each has its own timeout.

## Summary

A request crosses ~12 distinct stages before our code runs: name resolution,
TCP (and TLS) setup, text over the wire, kernel buffers, libuv's poll phase,
llhttp parsing, req/res construction, and the Express stack walk. Handlers
start at headers-parsed, not body-complete. Each stage has a cost we measured
and a timeout we'll eventually configure — and "slow" or "hung" is always a
question with a stage-shaped answer.

## Further reading

- High Performance Browser Networking (Ilya Grigorik) — chs. 1–2, free online: https://hpbn.co
- Node docs: `server.headersTimeout`, `server.requestTimeout`
