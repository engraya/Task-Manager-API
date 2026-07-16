# 01 — Introduction: What Is a Backend?

## Definition

A **backend** is the part of a software system that runs on a server — a machine the
user never sees — and is responsible for **data, rules, and truth**. It receives
requests over a network, applies business logic, reads and writes persistent data,
and returns responses.

An **API (Application Programming Interface)** is the contract through which the
outside world talks to the backend: a defined set of URLs, methods, request shapes,
and response shapes. The frontend is one *consumer* of that contract; mobile apps,
other services, and scripts are others.

A **server**, despite the intimidating name, is just **a program that never exits**:
it starts, binds to a port, and sits in a loop waiting for requests. That's it.
`node src/server.js` will be a server the moment it calls `.listen()`.

## History (compressed)

- **1960s–80s** — Mainframes and dumb terminals: *all* logic lives on the central machine.
- **1990s** — The web. Early sites are server-rendered: the backend builds full HTML
  pages (PHP, Perl, Java servlets). "Frontend" barely exists as a discipline.
- **2000s** — AJAX: browsers can fetch data *without reloading the page*. The
  frontend/backend split begins — the server starts returning **data** (XML, then JSON)
  instead of pages.
- **2010s–now** — Single-page apps (React, Vue) + mobile apps mean one backend serves
  many frontends. The API becomes a product in itself. This is the world this project
  lives in: our API will serve JSON to any client that speaks HTTP.

## Why the backend exists — the trust boundary

You know from frontend work that you can validate a form in the browser. So why
repeat validation, logic, and rules on the server?

**Because the client is enemy territory.** Anything running on the user's machine
can be inspected, modified, or bypassed entirely:

- A user can open DevTools and edit your JavaScript.
- Anyone can skip your app completely and send raw HTTP with `curl` or Postman.
- A malicious client can send *any* bytes it wants to your endpoints.

The backend is the **last line of defense and the single source of truth**:

| Concern | Frontend role | Backend role |
|---|---|---|
| Validation | UX nicety (instant feedback) | **Security requirement** (never trust input) |
| Business rules | Display them | **Enforce** them |
| Data | Cache/display it | **Own** it (database) |
| Secrets (API keys, DB passwords) | Must never appear here | Live here |
| Authentication | Store a token | **Verify** the token on every request |

Rule to tattoo somewhere: **frontend validation is a courtesy; backend validation
is a contract.** We will validate everything twice, and the backend copy is the one
that counts.

## The client–server model

```
        CLIENT (browser / mobile app / Postman / another server)
          │
          │  1. HTTP Request
          │     "POST /api/tasks, here's some JSON"
          ▼
   ┌─────────────────────────────────────────────┐
   │                 BACKEND                     │
   │                                             │
   │   receive → parse → validate → business     │
   │   logic → persist → build response          │
   │                                             │
   └───────────────┬─────────────────────────────┘
                   │                    ▲
                   ▼                    │
             ┌──────────┐              │
             │ DATABASE │──────────────┘
             └──────────┘
          │
          │  2. HTTP Response
          │     "201 Created, here's the task I saved"
          ▼
        CLIENT renders the result
```

Key property: the client and server share **nothing** except the messages they
exchange. They may be written in different languages, run on different continents,
and be restarted independently. The HTTP contract is the only coupling. This is
why API design matters so much — the contract outlives every implementation detail.

## What actually happens when a frontend calls an API

When your React code runs `fetch('https://api.example.com/tasks')`:

1. **DNS** — the browser resolves `api.example.com` to an IP address.
2. **TCP** — it opens a connection to that IP on port 443 (HTTPS) or 80 (HTTP).
3. **TLS** — (HTTPS) client and server negotiate encryption.
4. **HTTP request** — plain structured text is sent over the connection:

   ```
   GET /tasks HTTP/1.1
   Host: api.example.com
   Accept: application/json
   ```

5. **The server program** (our Node process) has been sitting on that port waiting.
   The OS hands it the bytes; Node parses them into a request object; our code runs.
6. **HTTP response** — structured text goes back:

   ```
   HTTP/1.1 200 OK
   Content-Type: application/json

   [{"id":1,"title":"Learn backend","completed":false}]
   ```

7. The browser hands the body to your JavaScript, `fetch` resolves, React re-renders.

Everything in this project happens inside step 5. (Full HTTP anatomy: see
[02-HTTP.md](02-HTTP.md), written in Phase 1 Step 1.5.)

## The backend's core responsibilities

1. **Expose an API** — a stable, predictable contract (REST, in our case).
2. **Validate input** — reject malformed or malicious data at the door.
3. **Enforce business logic** — "a task's priority must be low/medium/high",
   "you can't complete a deleted task."
4. **Persist data** — outlive the process; survive restarts (files → MongoDB, Phases 8–9).
5. **Authenticate & authorize** — who are you, and what are you allowed to do (Phases 10–11).
6. **Fail well** — return meaningful errors, log what happened, never leak internals (Phase 7).
7. **Stay observable** — logs and metrics so engineers can see inside a running system (Phase 13).

This list is essentially the table of contents of the whole project.

## Real-world examples

- You tap "Pay" in a food-delivery app → `POST /orders` → the backend validates the
  cart, checks the restaurant is open (business rule), charges the card (talks to a
  *payment provider's* API — backends consume APIs too), writes the order to the
  database, and returns `201 Created`.
- You load your Twitter/X feed → `GET /timeline` → the backend authenticates your
  token, assembles posts from several data stores, and returns JSON. The app is just
  a renderer for that JSON.

## Common mistakes (conceptual)

1. Trusting the client — skipping server-side validation because "the form already checks it."
2. Putting secrets in frontend code — every API key shipped to a browser is public.
3. Designing endpoints around your UI screens instead of your **resources** (see [03-REST.md](03-REST.md) later) — the API outlives the UI.
4. Treating the backend as "the database with extra steps" — the logic and rules layer is the actual product.

## Interview questions

1. **Why must validation be repeated on the backend if the frontend already validates?**
   Because clients can be bypassed or modified; the server is the only environment you control. Frontend validation is UX; backend validation is security.
2. **What is an API?** A defined contract (endpoints, methods, request/response shapes) through which clients interact with a system without knowing its internals.
3. **What does "the client and server are decoupled" mean?** They share only the HTTP contract — either side can be rewritten, scaled, or restarted independently as long as the contract holds.
4. **Name the core responsibilities of a backend.** API contract, validation, business logic, persistence, authn/authz, error handling, observability.

## Summary

The backend is the program that owns the data and enforces the rules, reachable only
through its API contract. The client is untrusted by definition, so every guarantee
the system makes must be enforced server-side. A "server" is simply a long-running
process listening on a port — which is exactly what we build next.

## Further reading

- MDN: [Client-Server overview](https://developer.mozilla.org/en-US/docs/Learn/Server-side/First_steps/Client-Server_overview)
- The Twelve-Factor App — https://12factor.net (production backend principles; we'll meet several factors in later phases)
