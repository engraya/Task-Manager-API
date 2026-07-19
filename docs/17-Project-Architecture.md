# 17 — Project Architecture: The Layers

## Definition

The codebase is organized as **layers by responsibility, files by resource**.
Each layer has one job, talks only to the layer directly below it, and can be
replaced without the layers above noticing:

```
            HTTP request
                 │
   ┌─────────────▼─────────────┐
   │ middlewares/              │  cross-cutting: logging, parsing,
   │  (pipeline, app.ts order) │  (soon: validation, errors, auth)
   ├───────────────────────────┤
   │ routes/                   │  WIRING: (method, path) → controller
   │  tasks.routes.ts          │  knows: URLs. knows nothing else.
   ├───────────────────────────┤
   │ controllers/              │  HTTP TRANSLATION: extract typed input,
   │  tasks.controller.ts      │  delegate, map results to status + body
   ├───────────────────────────┤
   │ services/                 │  BUSINESS LOGIC: rules, defaults,
   │  tasks.service.ts         │  invariants, merge semantics — NO HTTP
   ├───────────────────────────┤
   │ (storage)                 │  DATA: today an in-memory array inside
   │  Phase 8: files → Phase 9 │  the service; tomorrow a repository
   │  MongoDB                  │  behind the same function signatures
   └───────────────────────────┘
        shared: types/ (contracts) · config/ (environment) · utils/ (future)
```

## The dependency rule

**Dependencies point downward only.** Routes import controllers; controllers
import services; services import types. Never the reverse — a service that
imports from a controller has inverted the architecture. Enforcement today is
discipline + review; the compiler helps (a service file with `Response` in
its imports is a red flag you can grep for).

## What each layer is allowed to know

| Layer | Knows about | Must never touch |
|---|---|---|
| routes | URL shapes, controller names | logic, store, req parsing |
| controllers | req/res, status codes, envelopes, typed inputs | the store, business rules |
| services | domain types, rules, storage | req, res, status codes, headers |
| storage | persistence mechanics | domain rules |

The service signals outcomes in domain terms — `Task`, `undefined` ("no such
task"), `boolean` ("deleted?") — and the controller alone decides that
`undefined` means 404 on the wire. Phase 7 upgrades this vocabulary with
typed errors; the principle stays.

## Why layers — the three payoffs

1. **Replaceability along the seams.** Phase 9 swaps the array for MongoDB
   *inside/below the service*; controllers and routes don't change by even a
   line. Phase 12 tests services with plain function calls (no HTTP server)
   and controllers with supertest (no real storage).
2. **Navigability.** Any behavior has one home. Wrong status code →
   controller. Wrong default → service. Wrong URL → routes. Slow everything
   → middleware. Onboarding is a filename convention.
3. **Reviewability.** A PR that touches `tasks.service.ts` changes rules; one
   that touches only controllers changes wire behavior. The diff's location
   tells the reviewer what kind of scrutiny to apply.

## The cost side (honest ledger)

Layering is not free: more files, more hops to follow one request, and the
temptation to add layers before pressure exists ("speculative generality").
This project's rule — **folders are earned, not scaffolded** — is the
counterweight: we lived the 300-line monolith in Phase 3, felt it, and cut
twice (Phase 4: controllers; Phase 5: services), verifying behavior after
each cut. A layer you can't name the pressure for is a layer you shouldn't
have.

## How this maps to what companies run

This is the standard shape of a production Node service (NestJS formalizes
the same layers with decorators; Java/Spring and C#/.NET use the same
vocabulary). Two common extensions we'll meet:

- **Repository layer** (Phase 8/9): splits "business rules" from "how data
  is fetched" — the service orchestrates, the repository persists.
- **DTOs / mappers**: when the API shape and the storage shape diverge
  (they will, slightly, with MongoDB's `_id`), a mapping step keeps the
  contract stable while storage evolves.

## Common mistakes

1. Upward imports (service → controller) — architecture inversion.
2. HTTP types leaking down (`Response` in a service signature).
3. Business rules leaking up (an `if` about priorities in a controller).
4. Layer-per-technology folders that split one resource's logic across the
   codebase *without* the responsibility split (folders ≠ architecture; the
   dependency rule is the architecture).
5. Pre-building layers no pressure demands.

## Interview questions

1. **Walk me through your project's structure and why.** (The diagram +
   the dependency rule + "earned, not scaffolded.")
2. **How do you swap the database without touching HTTP code?** Storage
   lives behind the service seam; the service's function signatures are the
   contract the upper layers compile against.
3. **How does a service report "not found" without knowing about 404s?**
   Domain vocabulary — `undefined`/typed errors; the controller owns the
   mapping to HTTP.
4. **When are layers the wrong call?** When no pressure exists — a 50-line
   script with four folders is ceremony, not architecture.

## Summary

Four layers, one rule: dependencies point down, each layer speaks its own
vocabulary (URLs → HTTP → domain → persistence), and seams exist where
change is expected — storage (Phases 8–9), validation (6), errors (7),
auth (10). The structure was earned by lived pressure and verified by
behavior sweeps at every cut.

## Further reading

- Martin Fowler, *Service Layer* / *Repository* patterns (PoEAA)
- The Clean Architecture (Robert Martin) — the same dependency rule,
  generalized (and worth reading critically re: ceremony)
