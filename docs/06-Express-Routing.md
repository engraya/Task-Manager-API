# 06 — Express Routing

> Living document — started in Phase 3 (Router, mounting); route parameters
> and filtering sections grow as the endpoints do.

## Definition

**Routing is the dispatch problem: which code runs for a given (method, path)
pair.** We solved it primitively twice already — `if (method === 'GET' &&
url === '/tasks')` in the raw-Node server, then flat `app.get(...)` calls.
`express.Router` is the third and lasting form: a **mountable mini-application**
that owns one resource's routes and gets attached to the app at a prefix.

## Why it exists

A flat list of `app.get`/`app.post` calls in one file works at 3 routes and
collapses at 30: every resource's handlers interleave in one growing file,
prefixes get repeated on every path string, and nothing about the file
structure tells you where a route lives. The Router fixes all three:

- **Grouping** — everything about the tasks resource lives in
  `src/routes/tasks.routes.ts`; find-the-handler becomes a filename question.
- **Prefix once** — the router declares *relative* paths (`'/'`, `'/:id'`);
  the mount point (`/api/v1/tasks`) is stated exactly once, in app.ts. When
  v2 ships, one line changes.
- **Composability** — routers can nest (`usersRouter.use('/:userId/tasks',
  tasksRouter)`), and middleware can attach to a single router (Phase 5:
  auth on tasks but not on health).

## How mounting works

```ts
// routes/tasks.routes.ts — knows only RELATIVE paths
const tasksRouter = Router();
tasksRouter.get('/', listTasks);        // ← '/' relative to the mount

// app.ts — decides the prefix
app.use('/api/v1/tasks', tasksRouter);
```

Internally: `Router()` returns a mini layer-stack of its own (same structure
as the app's — see [05-Express.md](05-Express.md)). `app.use(prefix, router)`
adds ONE layer to the app whose match rule is "path starts with prefix."
When it matches, Express **strips the prefix** and hands the remainder to the
router's own stack:

```
request: GET /api/v1/tasks
   app stack:
     1. express.json()            runs, next()
     2. GET /health               no match
     3. use('/api/v1/tasks', R)   PREFIX MATCH → strip → router sees '/'
        └─ router stack:
             GET '/'              MATCH → handler
     4. 404 fallback              not reached
```

That prefix-stripping is why the router writes `'/'` and not
`'/api/v1/tasks'` — and why the same router could be mounted at `/api/v2/tasks`
tomorrow without touching its file.

## Route declaration order (inherited law)

Within a router, the same rule as the app: first match wins, declaration
order is execution order. This matters most with parameters (added in
Step 3.3): `'/special'` must be declared before `'/:id'`, or `:id` swallows
it (`id === "special"`).

## Route parameters (added Step 3.3)

`'/:id'` declares a **path segment capture**: any value in that position
matches, and Express exposes it as `req.params.id`.

```
GET /api/v1/tasks/18fc7c57-…
        mount strips prefix → router matches '/:id'
        req.params = { id: "18fc7c57-…" }
```

Facts that matter in practice:

- **Params are strings, always** — the boundary rule
  ([05-Express.md](05-Express.md)). Our ids are strings anyway (UUIDs), but a
  numeric-id API must parse.
- **A param matches ANY segment** — `/tasks/banana` also matches `'/:id'`
  with `id === "banana"`. There is no format checking in the route; unknown
  and malformed ids both fall to the same lookup-miss → 404. (Phase 6 can
  add UUID-format validation to fail faster with a clearer message.)
- **Declaration order strikes again** — a literal route like `'/stats'` must
  be declared *before* `'/:id'`, or it's swallowed (`id === "stats"`).
- **The find-or-404 guard pattern** — look up, guard-clause the miss with the
  contract's error envelope, then the happy path runs unindented. Used
  identically by GET one / DELETE / PATCH; the repetition is deliberate
  pressure for Phase 4's extraction.

## File conventions

- One router per resource: `tasks.routes.ts`, later `auth.routes.ts`.
- The `.routes.ts` suffix mirrors the upcoming `.controller.ts`,
  `.service.ts` — file names state their layer (a convention many production
  codebases use; consistency is the point, not the specific suffix).
- Routers export default; app.ts owns all mounting — one place to read the
  entire URL surface of the API.

## Common mistakes

1. Writing absolute paths inside a router (`router.get('/api/v1/tasks')`) —
   double-prefixed, nothing matches.
2. Declaring literal routes after parameterized ones — `/:id` swallows
   `/special`.
3. Mounting the 404 fallback before routers.
4. Splitting one resource across several routers "by method" — group by
   resource, not verb.

## Interview questions

1. **What is `express.Router`?** A mountable mini-application with its own
   layer stack; `app.use(prefix, router)` mounts it, and Express strips the
   prefix before the router matches.
2. **Why relative paths inside routers?** The mount point is the app's
   decision, stated once; the router stays reusable and version-agnostic.
3. **How does Express decide which handler runs?** One ordered stack walk;
   first (method, path) match wins — routers are just nested stacks.

## Summary

Routing evolved from if-chains to flat app routes to mounted routers: one
router per resource, relative paths inside, prefix declared once at the mount.
Mechanically it's the same layer-stack walk as ever — routers nest a stack
inside a stack — so the old law (order matters, first match wins) applies
unchanged.

## Further reading

- Express guide: Routing — https://expressjs.com/en/guide/routing.html
