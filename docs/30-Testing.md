# Testing

## Definition

A **test** is code that runs your code with known inputs and fails loudly when
the output isn't what you asserted. Its purpose is not to prove the code works
today — you already believe that — but to fail *the day a future change breaks a
promise you forgot you made*. Tests are how a codebase remembers its own
contract.

This project uses **Vitest** (the runner) and **Supertest** (HTTP-level
integration), with **mongodb-memory-server** providing a real, ephemeral
database for integration tests.

## The testing pyramid

```
        ╱  E2E  ╲          few  — whole system, slow, brittle
      ╱  integ.   ╲        some — real HTTP + real DB, medium
   ╱   unit tests   ╲      many — pure logic, milliseconds
```

Wide base, narrow top — an economic shape. Cheap, fast unit tests catch most
bugs, so you write many; slower integration tests catch the bugs only real
seams reveal, so you write just enough. This codebase has both:

| Level | File | What it isolates | Speed |
|---|---|---|---|
| Unit (pure) | `validators/task.schemas.test.ts` | zod schemas, no deps | ~15ms |
| Unit (mocked) | `services/tasks.service.test.ts` | service logic, repo mocked | ~40ms |
| Integration | `app.integration.test.ts` | the whole stack + real Mongo | ~6s |

## Why each level exists

**Unit tests** isolate one unit and mock its dependencies. Fast and precise —
when one fails, you know exactly which logic broke. Their blind spot: they can't
catch bugs *between* units (wrong argument order, unwired middleware, a query
the real DB rejects but a mock accepts).

**Integration tests** exercise those seams — a real HTTP request flowing through
route → middleware → controller → service → repository → a real database and
back. They answer "do the parts actually fit?" The cost is speed and setup, so
you write fewer, targeting the critical paths (auth, authorization, the happy
path) rather than every branch.

## Test doubles (mocking)

To unit-test code with dependencies, you replace those dependencies with a
**test double** you control. The family:

| Double | Behavior |
|---|---|
| **Stub** | returns canned values you configured |
| **Mock** | a stub that also *records calls*, so you can assert on interactions |
| **Spy** | wraps a real function to record calls while still calling through |
| **Fake** | a working lightweight implementation (e.g. an in-memory store) |

Vitest's `vi.fn()` is a mock. `vi.mock('../database/tasks.repository')`
auto-replaces every export with one. The critical mechanic is **hoisting**:
Vitest lifts `vi.mock` above the imports at transform time, so the replacement
is in place before the module-under-test captures its dependency reference.

This only works because of the **layered architecture**: the service depends on
the repository's five-function *contract*, not on Mongo. A fake satisfying that
contract is indistinguishable to the service — the seam built to swap storage
(array → file → Mongo) is the same seam we mock through. **Testability is
decoupling's dividend.** Code that's hard to test is usually too tightly coupled;
the difficulty is the design smell talking.

## Two kinds of assertion

- **Output** — `expect(result).toEqual(...)`: what the unit returned.
- **Interaction** — `expect(dep).toHaveBeenCalledWith(...)` / `.not.toHaveBeenCalled()`:
  *how* the unit used its dependency. This catches things the return value can't
  show — a filter pushed down to the DB, a write that must (or must not) happen.

## Integration testing without a port

`app.ts` and `server.ts` were split in Phase 1 precisely for this: `app.ts` is
the Express application; `server.ts` calls `.listen()`. Supertest imports the
*app* and drives it in-process — no socket, no port to allocate or collide on.
An architecture decision made early pays off exactly here.

```ts
await request(app)
  .post('/api/v1/tasks')
  .set('Authorization', `Bearer ${token}`)
  .send({ title: 'x' })
  .expect(201);
```

## The test database: why in-memory, not remote

Integration tests need a *real* database (a mock would defeat the point). Which
one matters. A **remote** database (Atlas) makes your test suite hostage to your
network, your IP allowlist, and the cluster's uptime — none of which relate to
whether your code is correct. (This project learned it the hard way: Atlas
became unreachable mid-development and every test that needed it hung for 15s.)

**mongodb-memory-server** spins up a genuine MongoDB in memory per run: real
`.lean()`, real unique indexes, real E11000 — but ephemeral, local, network-free.
The production code stayed honest via one optional parameter:
`connectToDatabase(uri = config.mongoUri)` — production uses config; tests pass
the in-memory URI. It needs a `mongod` binary, which it auto-downloads to a
cache on first run (a one-time cost; see `MONGOMS_SYSTEM_BINARY` in
`.env.example` for the manual-binary escape hatch if that download is
unreliable).

## Test isolation

Tests must not depend on each other's state or on execution order.

- **Unit:** `beforeEach(() => vi.clearAllMocks())` — fresh mock history/returns.
- **Integration:** `beforeEach` wipes the collections (`deleteMany({})`) — every
  test starts from an empty database.

Order-dependent tests are a debugging nightmare; independence is non-negotiable.

## Coverage — a map, not a target

`npm run test:coverage` reports the percentage of statements/branches/functions/
lines exercised by the suite. Read it as a **map of what's untested**, not a
score to maximize:

- **100% coverage does not mean bug-free** — you can execute every line while
  asserting nothing meaningful. Coverage measures *execution*, not *correctness*.
- **Chasing 100% wastes effort** on trivial or defensive code and breeds
  low-value tests written to color lines green.
- **Do use it to find blind spots** — an untested branch in an auth check or an
  error path is worth a test; an untested `console.log` is not.

This project's suite sits around ~82% statements. The honest gaps it reveals —
config's env-error branches, the error handler's rarer paths, the controller's
query-parameter validation — are real "could add a test here" signals, chosen
deliberately rather than papered over to hit a number.

## Running tests

| Command | Runs |
|---|---|
| `npm test` | the whole suite once |
| `npm run test:watch` | re-runs affected tests on save (the tight dev loop) |
| `npm run test:unit` | fast tests only (excludes `*.integration.test.ts`) |
| `npm run test:integration` | integration tests only (needs the mongod binary) |
| `npm run test:coverage` | full suite + coverage report |

Separating unit from integration keeps the save-driven feedback loop fast (units
in milliseconds) while the slower integration tests run before push / in CI.

## Common mistakes

1. **Only unit tests** — misses wiring/seam bugs (arg order, middleware, real-DB
   behavior).
2. **Testing implementation, not behavior** — assert produced values, not "was
   accepted"; assert the transform, not just success.
3. **Hitting a real/remote DB in tests** — slow, flaky, order-coupled. Use an
   ephemeral local one; reset between tests.
4. **Mock hoisting gotcha** — `vi.mock`'s factory runs above imports; don't
   reference outer variables in it.
5. **Coverage worship** — 100% proves execution, not correctness; chase blind
   spots, not the number.
6. **Shipping tests to production** — exclude `*.test.ts` from the build
   (`tsconfig.build.json`), keep them type-checked by the base config.

## Interview questions

1. **What's the value of a test if you already know the code works?** Regression
   protection — it fails when a future change silently breaks a promise.
2. **Explain the testing pyramid.** Many fast unit tests, fewer integration,
   few E2E — shaped by cost vs. what each level can catch.
3. **Stub vs. mock vs. fake?** Stub returns canned values; mock also records
   calls; fake is a working lightweight implementation.
4. **How do you test an Express app without opening a port?** Split app from
   `.listen()`; drive the app in-process with Supertest.
5. **Why an in-memory DB for tests, not your dev/prod one?** Speed, isolation,
   and independence from network/cluster state — real behavior, ephemeral.
6. **Does 100% coverage mean the code is correct?** No — coverage measures
   execution, not assertion quality. Use it to find gaps, not as a target.

## Summary

Testing turns every manual verification into a permanent, instant check. This
project layers pure unit tests (schemas), mocked unit tests (the service, via a
contract-shaped seam that makes mocking clean), and integration tests (the real
stack through Supertest against an in-memory MongoDB). The crown jewel is the
authorization regression test — the Phase 11 "your tasks are yours" guarantee,
frozen so it can never silently break. Coverage is read as a map of blind spots,
not worshipped as a number. The infrastructure (build/test config split, in-
memory DB, unit/integration separation) keeps the suite fast to run and safe to
ship.

## Further reading

- Vitest docs — mocking, coverage, config
- Supertest — HTTP assertions against Node servers
- mongodb-memory-server — ephemeral MongoDB for tests
- Martin Fowler, "TestPyramid" and "Mocks Aren't Stubs" — the canonical essays
- Kent C. Dodds, "Write tests. Not too many. Mostly integration." — on balance
