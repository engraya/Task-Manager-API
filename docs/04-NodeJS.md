# 04 — Node.js: The Runtime

## Definition

**Node.js is a JavaScript runtime built on Chrome's V8 engine that executes JS
*outside* the browser, with an event-driven, non-blocking I/O model.**

Unpacking each part:

- **Runtime** — the environment that executes your code and provides its standard
  library. The browser gives JS `window`, `document`, `fetch`; Node gives it `fs`
  (files), `http` (servers), `process`, `net` (TCP). Same language, different powers.
- **V8** — Google's open-source JS engine (the thing inside Chrome that compiles JS
  to machine code). Node embeds it.
- **Event-driven, non-blocking I/O** — the architectural bet the rest of this
  document explains. This phrase is *why Node exists*, not a feature bullet.

## History — the problem Node was built to solve

**The C10K problem (early 2000s):** how does one server handle ten thousand
simultaneous connections?

The traditional model (Apache, classic Java) was **thread-per-request**: each
incoming connection gets its own OS thread. Threads are expensive — each one
reserves stack memory (~1 MB), and the OS burns CPU switching between them. At
thousands of connections, servers drowned not in *work* but in *waiting*: most of
those threads were idle, blocked on a database or a slow client, holding memory
while doing nothing.

The insight (proven by **nginx**, 2004): a web server's job is overwhelmingly
**I/O-bound** — waiting for the network, the disk, the database. Waiting doesn't
need a thread. One thread with an **event loop** can *initiate* thousands of I/O
operations, do other work while the OS handles them, and react when each completes.

**2009 — Ryan Dahl releases Node.js**, applying that model with JavaScript, for two
reasons that turned out to be brilliant:

1. JS had **no existing server I/O library to stay compatible with**, so the entire
   standard library could be async-first from day one.
2. JS programmers were *already trained* on this model — browser code is nothing
   but event handlers (`onClick`, `onLoad`). Every frontend developer already
   thinks in callbacks and events. Including you.

**2015+:** ES6, Promises, then `async/await` made the model pleasant to write.
io.js fork/merge led to the modern Node Foundation and the steady release cadence
that gives us Node 22.

## Node's architecture — what's inside

Node is mostly **glue between two C/C++ libraries**:

```
┌───────────────────────────────────────────────────────────┐
│                     YOUR JAVASCRIPT                       │
│              (app.js, controllers, ...)                   │
├───────────────────────────────────────────────────────────┤
│                 NODE CORE MODULES (JS + C++)              │
│           http, fs, net, crypto, path, ...                │
├────────────────────────┬──────────────────────────────────┤
│          V8            │             libuv                │
│  (Google, C++)         │        (C, built for Node)       │
│                        │                                  │
│  • executes JS         │  • THE EVENT LOOP                │
│  • call stack          │  • async I/O (network, files)    │
│  • heap / GC           │  • thread pool (4 threads:       │
│  • JIT compilation     │    fs, dns, crypto, zlib)        │
│                        │  • timers                        │
└────────────────────────┴──────────────────────────────────┘
                    Operating System
        (epoll / kqueue / IOCP — async notification APIs)
```

- **V8** runs your JavaScript on **one thread** (the "main thread"). One call stack,
  one thing executing at a time.
- **libuv** owns everything asynchronous: it asks the OS to "tell me when this
  socket has data" (using the OS's native async APIs — `epoll` on Linux, `IOCP` on
  Windows) and runs **the event loop** that feeds completed work back to V8.
- For the few operations OSes can't do asynchronously (most file operations, DNS
  lookups, CPU-heavy crypto), libuv keeps a small **thread pool** (default 4
  threads) so even those don't block your JS.

So "Node is single-threaded" is shorthand. Precisely: **your JavaScript runs on a
single thread; the runtime underneath uses the OS and a small thread pool to do I/O
in parallel.**

## Blocking vs non-blocking — the core mental model

**Blocking (thread-per-request world):**

```
Thread handling request A:
  read request ──► query database ██████████ (waits 50ms, thread frozen) ──► respond
                                  ▲
                    thread can do NOTHING else here;
                    request B needs its own thread
```

**Non-blocking (Node):**

```
Main thread (your JS):
  reqA arrives → start DB query A (hand off to libuv) ─┐
  reqB arrives → start DB query B (hand off to libuv) ─┤ all initiated,
  reqC arrives → start DB query C (hand off to libuv) ─┘ none waited for
  ... thread is FREE ...
  ◄─ query B done! run B's callback → respond to B
  ◄─ query A done! run A's callback → respond to A
  ◄─ query C done! run C's callback → respond to C
```

One thread served three requests *concurrently* — not by computing three things at
once (it can't), but by **never sitting idle while I/O is in flight**. Concurrency
here means *overlapping waiting*, not parallel computing.

This is why Node is a superb fit for APIs (per request: tiny compute, lots of I/O)
and a poor fit for CPU-heavy work (video encoding, big loops) — heavy computation
happens *on* the one JS thread and freezes everyone. More below.

## The event loop

The event loop is a literal loop inside libuv. Each iteration ("tick") passes
through phases; simplified to what matters in practice:

```
        ┌─────────────────────────────┐
   ┌──► │  timers                     │  run setTimeout/setInterval callbacks
   │    │                             │  whose time has expired
   │    ├─────────────────────────────┤
   │    │  poll                       │  ◄── THE HEART: wait for I/O events
   │    │                             │      (socket readable, file read done),
   │    │                             │      run their callbacks
   │    ├─────────────────────────────┤
   │    │  check                      │  run setImmediate callbacks
   │    ├─────────────────────────────┤
   │    │  close callbacks            │  e.g. socket.on('close')
   │    └──────────────┬──────────────┘
   └───────────────────┘
        between EVERY callback, drain the MICROTASK queue:
        process.nextTick(), then resolved Promises (.then/await)
```

Rules that explain almost every event-loop behavior you'll ever see:

1. **A callback runs to completion** — nothing interrupts your function mid-execution.
   (No data races on shared variables — a real advantage over threads.)
2. **Microtasks (Promise callbacks) run between every macrotask**, before the loop
   moves on. `await` resumption beats a `setTimeout(fn, 0)`.
3. **The loop only advances when the call stack is empty.** Hence the golden rule:

> **Don't block the event loop.** One long synchronous operation — a giant loop,
> `JSON.parse` on a 100 MB string, `fs.readFileSync` in a request handler — freezes
> *every* connected client, because there is only one JS thread.

Trace this classic:

```js
console.log('1');                          // runs immediately (call stack)
setTimeout(() => console.log('2'), 0);     // macrotask → timers phase, next tick
Promise.resolve().then(() => console.log('3')); // microtask → after current stack
console.log('4');                          // runs immediately
// Output: 1 4 3 2
```

Synchronous code first (1, 4) → stack empties → microtasks drain (3) → event loop
proceeds to timers (2). If you can explain that output, you understand the loop.

## What this means for a web server

A Node HTTP server is: *register a callback for "connection", give the loop control,
react forever.*

```
node src/server.js
   │
   ├─ run your top-level code once (create server, .listen(3000))
   │     .listen() = "libuv, watch port 3000 and wake me up"
   │
   └─ event loop runs forever ◄──────────────────────┐
         request arrives (poll phase)                │
         → your handler runs (parse, validate, ...)  │
         → await database  → handler suspends,       │
           loop serves OTHER requests meanwhile      │
         → DB responds → handler resumes → respond ──┘
```

The process never "finishes" — that's what makes it a server. It exits only if it
crashes or is told to stop. Also note: **one process = one event loop = one CPU
core.** Production systems run one Node process per core (via `cluster`, PM2, or —
most commonly today — multiple containers behind a load balancer). Scaling Node is
horizontal by design.

## Production use — where Node fits

- **Great fit:** REST/GraphQL APIs, real-time apps (chat, live feeds — WebSockets
  love the event model), gateways/BFFs (backend-for-frontend), streaming, tooling.
  Used at scale by Netflix (API layer), PayPal, LinkedIn, Uber, Walmart.
- **Poor fit:** CPU-bound work — image/video processing, ML inference, heavy
  cryptography, big synchronous computations. Options when you must: `worker_threads`,
  child processes, or a separate service in another language.
- **The one-liner:** Node buys extreme I/O concurrency per process at the price of
  fragility to CPU-heavy work and single-core execution per process.

## Common mistakes

1. **Blocking the event loop** — sync APIs (`fs.readFileSync`, `crypto.pbkdf2Sync`)
   or heavy loops inside request handlers. Fine at startup (config loading, once);
   catastrophic per-request.
2. **Believing "single-threaded" means "handles one request at a time."** It handles
   thousands concurrently — it *computes* one callback at a time.
3. **Assuming Node is fast at everything.** It's fast at I/O orchestration; raw
   compute is just V8 — decent, but one core and one thread.
4. **Ignoring the microtask/macrotask distinction** — leads to "why does my code
   run in the wrong order" bugs. When in doubt, re-trace the `1 4 3 2` example.
5. **Unhandled promise rejections** — an async error nobody catches. In modern Node
   this **crashes the process**. Phase 7 (error handling) exists largely because of this.

## Best practices

- Keep request handlers I/O-bound and quick; move heavy compute out of the hot path.
- Prefer `async/await` (Phase docs [14-Async-Await.md](14-Async-Await.md) /
  [15-Promises.md](15-Promises.md)) over raw callbacks — same event loop, readable code.
- Sync APIs only at startup, never per-request.
- Plan for one process per core; keep processes stateless so they can be multiplied
  (this is why sessions/state belong in a database or cache, not in process memory).

## Interview questions

1. **Is Node single-threaded?** JS execution is single-threaded (one call stack in
   V8); libuv uses OS async APIs plus a ~4-thread pool for I/O. So: one thread for
   *your code*, helpers underneath.
2. **How does Node handle 10,000 concurrent connections on one thread?** Non-blocking
   I/O: it initiates operations and reacts to completion events via the event loop;
   the thread never waits on I/O, it only executes callbacks.
3. **What does "don't block the event loop" mean?** Any long synchronous computation
   monopolizes the single JS thread, freezing all other requests. Keep handlers
   short and async.
4. **`setTimeout(fn, 0)` vs `Promise.resolve().then(fn)` — which runs first?** The
   promise: microtasks drain before the event loop advances to the timers phase.
5. **When is Node the wrong choice?** CPU-bound workloads — the event loop model
   gives no benefit and the single thread becomes the bottleneck.

## Summary

Node = V8 (executes your JS, one thread) + libuv (event loop + async I/O). It was
built on the insight that servers mostly *wait*, and waiting doesn't need threads.
Your code runs one callback at a time to completion; concurrency comes from
overlapping I/O, not parallel computation. Consequences that shape every later
phase of this project: handlers must be async and quick, errors in async code need
deliberate handling, and processes are scaled horizontally.

## Further reading

- Node.js docs: [The Node.js Event Loop](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick)
- Node.js docs: [Don't Block the Event Loop](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop)
- Talk: Philip Roberts, *"What the heck is the event loop anyway?"* (JSConf EU) — the classic visual explanation (browser loop, but the model transfers)
- The C10K problem: http://www.kegel.com/c10k.html (historical)
