# 03 — REST: The Design Discipline

## Definition

**REST (Representational State Transfer) is an architectural style for APIs in
which everything is a *resource* (a noun, addressed by a URL), manipulated
through a small, uniform set of verbs (the HTTP methods), exchanging
*representations* (JSON documents) of the resource's state.**

Three words carry the whole idea:

- **Resource** — a thing with identity: *task 42*, *the collection of tasks*.
  Addressed by URL: `/tasks/42`, `/tasks`.
- **Representation** — what actually travels: a JSON document *representing*
  the resource's current state. The client never touches the resource itself
  (a row, an object in memory) — only representations of it.
- **Transfer** — client and server exchange these representations over the
  uniform interface of HTTP methods; the interaction carries no session state
  (statelessness, from [02-HTTP.md](02-HTTP.md)).

## History

- **2000** — Roy Fielding's PhD dissertation names and systematizes REST.
  Fielding co-authored HTTP/1.1 itself: REST is essentially *"the web's own
  architecture, applied deliberately"* — he described why the web scaled, as
  constraints you can follow.
- **2000s** — REST displaces SOAP/XML-RPC (heavyweight, verb-oriented,
  XML-envelope protocols) for public APIs. JSON displaces XML.
- **2010s–now** — "REST" colloquially means *JSON-over-HTTP APIs following
  resource conventions* — that's what job postings and this project mean.
  Alternatives exist in niches (GraphQL for flexible client-driven queries,
  gRPC for internal service-to-service RPC); REST remains the default for
  public-facing HTTP APIs.

## Why it exists — conventions are compression

Nothing *stops* you from designing `POST /getTasks`, `POST /doTaskUpdate`,
`GET /removeTask?id=42`. HTTP allows it. The cost is that every consumer of
your API must *learn* it, endpoint by endpoint, because it follows no shared
grammar — and infrastructure (caches, retries, monitoring) can't help, because
you've hidden the semantics.

REST is a shared grammar. If I tell you our API has a `tasks` resource and
nothing else, you can already guess all five endpoints, their methods, their
status codes, and their idempotency behavior — and you'd be right. That
predictability is the entire value proposition:

```
   RPC style (verbs, unbounded)        REST style (nouns × fixed verbs)
   ─────────────────────────────       ─────────────────────────────────
   POST /createTask                    POST   /tasks
   POST /getAllTasks                   GET    /tasks
   POST /getTaskById                   GET    /tasks/:id
   POST /updateTaskTitle               PATCH  /tasks/:id
   POST /markTaskDone                  DELETE /tasks/:id
   POST /removeTask
   ...one new verb per feature...      ...vocabulary never grows...
```

## The mapping — resources × methods = CRUD

| Operation | Method + Path | Success | Safe | Idempotent |
|---|---|---|---|---|
| **C**reate | `POST /tasks` | 201 + created representation | ❌ | ❌ |
| **R**ead all | `GET /tasks` | 200 + array | ✅ | ✅ |
| **R**ead one | `GET /tasks/:id` | 200 + object | ✅ | ✅ |
| **U**pdate | `PATCH /tasks/:id` (partial) / `PUT` (full replace) | 200 + updated | ❌ | PUT ✅ / PATCH \* |
| **D**elete | `DELETE /tasks/:id` | 204, empty body | ❌ | ✅ |

\* PATCH with "set these fields" semantics (ours) is idempotent in practice;
the spec doesn't guarantee it for all patch formats.

**PUT vs PATCH** — PUT means *replace the entire resource with this
representation* (omitted fields are removed); PATCH means *apply this partial
change* (omitted fields are untouched). Most real-world "edit" UIs — including
a task manager checking off a checkbox — are partial by nature, which is why
our API uses PATCH.

## URL design rules

1. **Nouns, never verbs** — the verb is the HTTP method. `/tasks`, not
   `/getTasks`. If you feel the need for a verb, you've usually discovered a
   missing resource (e.g. not `POST /tasks/42/complete` but
   `PATCH /tasks/42 {"completed": true}`).
2. **Plural collection, id for members** — `/tasks` is the collection,
   `/tasks/42` a member. Consistent plural avoids the `/task` vs `/tasks`
   coin-flip.
3. **Hierarchy = containment** — `/users/7/tasks` means "tasks belonging to
   user 7." Keep nesting shallow (one level); deep nesting
   (`/users/7/projects/3/tasks/42/comments`) is brittle — resources with
   global identity deserve top-level URLs.
4. **Query strings refine, never identify** — `/tasks?completed=true&sort=dueDate`
   filters/sorts *the same resource*; `/tasks/42` identifies a *different*
   resource. Filtering via query, identity via path.
5. **Version the contract** — `/api/v1/tasks`. Clients depend on exact shapes;
   breaking changes ship as `/api/v2` while v1 keeps serving old clients.
   (URL versioning is the most common of several schemes; header-based
   versioning exists but is rarer.)

## Statelessness in REST terms

Each request is self-contained (see [02-HTTP.md](02-HTTP.md)). RESTfully put:
*all session state lives on the client* (later: your JWT rides along on every
request — Phase 10); *all resource state lives on the server* (the database).
Nothing lives in between — no server-side session memory — which is what lets
any process behind the load balancer answer any request.

## Richardson Maturity Model (how "RESTful" is an API?)

- **Level 0** — one URL, one method, RPC envelopes (SOAP style).
- **Level 1** — resources with URLs, but methods ignored (everything POST).
- **Level 2** — resources + proper methods + proper status codes.
  **← industry standard; this project.**
- **Level 3** — HATEOAS: responses embed links to available next actions
  (`"links": {"complete": "PATCH /tasks/42"}`). Architecturally elegant,
  rarely implemented in practice; know the term for interviews.

## Production use

- Public APIs (Stripe, GitHub, Twilio) are Level-2 REST with meticulous
  contracts — their API reference docs *are* the contract, and teams write
  them before implementing (contract-first design — exactly what
  [API-Contract.md](API-Contract.md) does for us).
- Contract-first pays off in parallelism: frontend and backend teams build
  against the agreed shapes simultaneously; QA writes tests from the contract.
- Machine-readable contracts (OpenAPI/Swagger) generate docs, clients, and
  validation from one YAML file — Phase 14 territory, same idea.

## Common mistakes

1. **Verbs in URLs** (`/tasks/create`, `/getTaskById`) — grammar violation;
   the method already says it.
2. **Everything-POST** — throws away caching, safe retries, and semantics
   (Level 1 maturity).
3. **200 for everything** — status codes are part of the contract
   ([02-HTTP.md](02-HTTP.md)); clients and monitors read them first.
4. **Endpoints shaped by UI screens** (`/dashboard-data`) — the API outlives
   every screen; model the domain, let clients compose.
5. **Inconsistency** — `/tasks` plural here, `/user` singular there; `camelCase`
   fields in one response, `snake_case` in another. Conventions only pay if
   they're uniform.
6. **Breaking the contract silently** — renaming a response field is a
   breaking change; that's what versioning is for.

## Interview questions

1. **What is a resource vs a representation?** Resource: the identified thing
   (`/tasks/42`); representation: the JSON document describing its state that
   actually travels.
2. **Why PATCH over PUT for edits?** PATCH applies partial changes (omitted
   fields untouched); PUT replaces wholesale (omitted fields removed). UIs
   edit partially.
3. **How do you version a REST API and why?** Commonly `/api/v1` in the path;
   clients depend on exact shapes, so breaking changes ship as a new version
   while the old keeps serving.
4. **What's Richardson Level 2?** Resources + HTTP methods + status codes used
   semantically — the practical industry standard.
5. **Where does state live in REST?** Session state on the client (sent with
   each request); resource state on the server (database); nothing in between.
6. **When would you not choose REST?** Client-composed flexible queries →
   GraphQL; low-latency typed internal RPC → gRPC; real-time push → WebSockets.

## Summary

REST maps a fixed verb set (HTTP methods, with their safety/idempotency
semantics) onto domain nouns (resources at URLs), exchanging JSON
representations statelessly. Nouns in paths, verbs in methods, refinement in
query strings, versioning for contract evolution, consistency above all. Our
own application of this grammar is written down in
[API-Contract.md](API-Contract.md) — the document the next six phases
implement.

## Further reading

- Fielding's dissertation, ch. 5 — https://www.ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm
- Richardson Maturity Model (Fowler) — https://martinfowler.com/articles/richardsonMaturityModel.html
- Stripe API reference (contract-craft benchmark) — https://docs.stripe.com/api
