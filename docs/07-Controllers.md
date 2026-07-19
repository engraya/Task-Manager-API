# 07 — Controllers

## Definition

**A controller is the HTTP layer of a resource: the functions that translate
between the protocol and the application.** Inbound, it extracts and shapes
what the request carries (params, query, body); outbound, it converts an
outcome into a status code and response body. That translation is its *entire*
legitimate job.

The layered target architecture (assembled one phase at a time):

```
routes/       WIRING       which (method, path) → which controller     (Phase 3)
controllers/  HTTP         req/res ↔ typed values, status codes        (Phase 4) ← here
services/     BUSINESS     rules, defaults, invariants                 (Phase 5)
(storage)     DATA         find/save/delete                            (Phase 5/8/9)
```

Each layer only talks to the next one down. The controller never touches the
array; the service never touches `res`.

## History — where "controller" comes from

The name is MVC's C (Model–View–Controller, Smalltalk, 1979; web-framework
mainstream via Rails, 2005). In a JSON API there is no real View (serialization
plays the role), but the controller survives because its boundary is the
valuable one: **the protocol/domain boundary.** Swap Express for Fastify, or
HTTP for a message queue, and controllers change while services don't. That
thought experiment — "what would have to change if the transport changed?" —
is the layer test.

## Why extract it — what Phase 4 actually bought

The routes file had grown to ~300 lines wearing four hats (wiring, HTTP,
business rules, data). The extraction bought, concretely:

1. **Routes became a table of contents** — five lines; the API's surface
   readable at a glance.
2. **Named units** — `updateTask` is a function with a name, individually
   importable and (Phase 12) individually testable.
3. **Deduplication fell out naturally** — three verbatim 404 constructions
   became one `sendNotFound(res)`; the 422 envelope became
   `sendValidationError(res, details)`. Refactors surface duplication that
   inline code hides.
4. **A seam for the next cut** — with HTTP isolated at the top of each
   function, the non-HTTP middle (defaults, merges, filtering) is visibly
   *one extraction away* from becoming a service.

## The typing pattern: `RequestHandler`

```ts
export const listTasks: RequestHandler = (req, res) => { ... };
```

Typing the *function* (Express's `RequestHandler`) instead of annotating each
parameter gives `req`/`res` their types by inference, keeps signatures
uniform, and matches what `router.get(...)` expects — a mismatch is a compile
error at the wiring site.

Convention: `export const <verb><Resource>: RequestHandler` — `listTasks`,
`createTask`, `getTask`, `updateTask`, `deleteTask`. File name mirrors the
layer: `tasks.controller.ts` beside `tasks.routes.ts`, later
`tasks.service.ts`.

## The thin-controller principle

The industry shorthand is **"fat services, thin controllers."** A controller
function should read as: extract → delegate → respond. Litmus tests for code
that does NOT belong in a controller:

- Would this line survive a transport change? (business rule → service)
- Does this line touch the store? (data access → service/repository)
- Is this line a rule about *tasks* rather than about *HTTP*? (service)

Our controllers currently FAIL these tests on purpose — the store and the
rules still live in the controller file, clearly marked. One refactor per
phase: the seam is visible, Phase 5 cuts along it.

## Production use

- Real codebases are navigated by this convention: an engineer dropped into
  an unfamiliar service finds `*.controller.*` and knows exactly what kind of
  code they'll see. Convention is documentation.
- Controller-level tests (supertest) exercise HTTP concerns; service-level
  tests exercise rules without any HTTP — the split makes both cheap
  (Phase 12).
- Frameworks like NestJS bake the layer in with decorators
  (`@Controller('/tasks')`); the concept transfers 1:1.

## Common mistakes

1. **Business logic creeping into controllers** — starts with one innocent
   `if`, ends with untestable 300-line handlers. The litmus tests above are
   the antidote.
2. **Controllers calling controllers** — a controller is not a library;
   shared behavior belongs in a service both can call.
3. **Services touching `res`** — inverts the layering; a service returns
   values/throws, and only the controller speaks HTTP.
4. **Splitting layers by technology instead of resource** (all controllers
   for every resource in one file) — group by resource, layer within.
5. **Extracting to "clean up" without a behavior test** — a refactor is only
   safe if verified: identical external behavior, proven (our full sweep ran
   before and after).

## Interview questions

1. **What belongs in a controller vs a service?** Controller: protocol
   translation (parse input, choose status, shape body). Service: rules and
   data. Test: what changes if you swap HTTP for a queue?
2. **Why "thin controllers, fat services"?** Business logic in services is
   transport-independent and unit-testable; controllers are glue that should
   stay boring.
3. **What is Express's `RequestHandler` type?** The `(req, res, next)`
   function signature; typing handlers with it gives inference and guarantees
   the wiring site compiles.
4. **How do you verify a refactor changed nothing?** Behavior sweep before
   and after — identical statuses and bodies for every case, including error
   paths.

## Summary

Controllers are the protocol/domain boundary: HTTP in, HTTP out, nothing else.
Phase 4 cut them out of the routes file — routes became five lines of wiring,
handlers became named typed functions, duplication collapsed into helpers, and
the behavior sweep proved the outside world can't tell anything happened.
The remaining impurity (store + rules in the controller file) is labeled and
scheduled: Phase 5 cuts the service layer along the seam this phase exposed.

## Further reading

- Martin Fowler, *Patterns of Enterprise Application Architecture* — "Model
  View Controller" and "Service Layer" entries
- NestJS Controllers docs (the same concept, formalized) — https://docs.nestjs.com/controllers
