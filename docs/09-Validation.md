# 09 — Validation

## Definition

**Validation is the act of converting untrusted input into proven, typed,
normalized values — or rejecting it with precise errors.** It happens at the
trust boundary ([01-Introduction.md](01-Introduction.md)): everything that
arrives over the wire is `unknown` until validation says otherwise, no matter
what any TypeScript interface claims ([25-TypeScript.md](25-TypeScript.md) —
types are erased; attackers don't read interfaces).

The guiding principle: **parse, don't validate.** A validator that answers
"is this OK?" (boolean) leaves you holding the same untyped value — the
evidence dies at the check. A *parser* returns a typed value or a typed
failure; possession of the value IS the proof:

```
unknown ──► parser ──┬─► { success: true,  data: CreateTaskInput }   (typed, transformed)
                     └─► { success: false, error: issues[] }          (aggregated details)
```

## The six jobs (learned by hand in Step 6.1)

Every serious validator — manual or library — does these:

1. **Shape check** — is it a plain object at all?
2. **Unknown-field rejection** — `titel` gets an error, not silence.
3. **Type + bounds checks** — per field, with named error details.
4. **Closed-set membership** — enums (`priority`).
5. **Parse + normalize** — dates → canonical UTC, strings → trimmed.
   Validation is an airlock, not a gate: one representation downstream.
6. **Error aggregation** — all problems in one 422, not fix-resubmit-fix.

We wrote all six manually for one endpoint (~100 lines — see
`src/validators/create-task.manual.ts` in git history at commit `67d7c73`),
then replaced them with ~10 declarative lines of zod. Do it by hand once;
never again.

## Zod: schema as single source of truth

```ts
export const createTaskSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  priority: z.enum(PRIORITIES).optional(),
  dueDate: isoDatetime.nullable().optional(),   // validates AND normalizes to UTC
  ...
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;   // ← THE INVERSION
```

Key ideas, in the order they mattered to this project:

- **`z.infer`** — the static type is *computed from* the runtime schema.
  Check and type are one artifact; drift is structurally impossible. This is
  the bridge between the erased compile-time world and the runtime world.
- **Chains are pipelines** — `.trim().min(1)` reads left to right:
  transform, then check the transformed value.
- **`strictObject`** — unknown keys are rejected. Zod's default (`z.object`)
  silently STRIPS them — the exact silent-drop our contract forbids. Know
  your library's default.
- **`.nullable().optional()`** — null ("clear it") vs absent ("don't touch")
  as two explicit words; the PATCH trichotomy ([API-Contract.md](API-Contract.md)).
- **`.refine`** — cross-field rules (e.g. "at least one field present").
- **`safeParse`** — returns the discriminated union above. (`parse` throws
  instead — useful once central error middleware exists, Phase 7.)
- **Anti-corruption mapping** — `zodIssuesToDetails` translates zod's issue
  format to our contract's `{field, message}`. The wire format is contract;
  the library is a swappable implementation detail.

## Validation as middleware (Step 6.3)

The factory pattern — a function that *returns* a middleware:

```ts
export function validateBody(schema: ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) { /* 422 envelope */ return; }
    req.body = result.data;   // parsed & transformed replaces raw
    next();
  };
}

// routes — the chain reads left to right; policy visible at a glance:
tasksRouter.post('/', validateBody(createTaskSchema), createTask);
tasksRouter.patch('/:id', validateBody(updateTaskSchema), updateTask);
```

What this buys:

- **Controllers only run with proven input** — the reject path never reaches
  them; validation code isn't repeated per handler.
- **The routes file becomes the policy document** — which endpoint validates
  what, one line each.
- **Replacing `req.body` with `result.data`** means downstream code gets the
  *transformed* values (trimmed, UTC-normalized) — using the raw body after
  validation would discard both the transforms and the proof.

**The honest typing caveat:** the controller reads
`req.body as CreateTaskInput` — an assertion. Unlike the Phase 3 cast-lies,
it is backed by a runtime guarantee (the middleware in the chain), but the
compiler cannot see across the chain, so it is *documented trust*, not proof.
Typed wrapper patterns exist to close even this gap (generics over the
handler); they add ceremony we've deferred until the trade is worth it.

## The express-validator contrast (the road not taken)

The classic Express approach — chains of check functions as middleware:

```ts
router.post('/',
  body('title').isString().trim().notEmpty().isLength({ max: 200 }),
  body('priority').optional().isIn(PRIORITIES),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { /* map + 422 */ }
    next();
  },
  createTask,
);
```

Same six jobs, different trade-offs: it's middleware-native and ubiquitous in
older codebases/tutorials — but the checks and the TypeScript types stay
**separate artifacts** (no inference; you still hand-write `CreateTaskInput`
and hope it matches), and results are collected via `validationResult(req)`
mutation rather than returned values. In a TS codebase, schema inference wins;
recognize express-validator on sight because you *will* meet it.

## What validation is NOT (boundary drawing)

- **Not authorization** — "is this a valid task shape?" vs "may THIS user
  touch THIS task?" (Phase 11). Validation has no idea who you are.
- **Not business rules** — "priority is one of three strings" is validation;
  "completed tasks can't change priority" (if we had such a rule) is a
  service-layer decision. Shape vs policy.
- **Not sanitization-for-HTML** — we normalize (trim, UTC), but escaping for
  XSS is an *output* concern belonging to whoever renders; APIs store clean
  data, renderers escape it.

## Production practices

- Validate every input channel: body (done), query (done manually,
  schema-friendly), params, headers when meaningful.
- 422 + per-field details for content errors; 400 for the unparseable;
  aggregate, don't stop at first error.
- Never leak the library's raw error format — map to your contract.
- Schemas live beside the resource and are the types (`z.infer`) — one
  artifact to review in every PR that changes an input.

## Common mistakes

1. Hand-written interface + separate schema — drift; infer instead.
2. `z.object` (strip) where the contract demands strict.
3. Using the raw body after validation — discards transforms and proof.
4. First-error-only responses.
5. Validating but not normalizing — mixed representations downstream break
   sorting/equality quietly.
6. Treating client-side validation as backend security (see
   [01-Introduction.md](01-Introduction.md): the frontend copy is UX).

## Interview questions

1. **"Parse, don't validate" — what does it mean?** Return typed values as
   evidence rather than booleans; invalid states become unrepresentable
   downstream.
2. **What does `z.infer` fix?** Type/check drift — the type is computed from
   the schema; one source of truth.
3. **Where should validation run and why?** As route-level middleware:
   controllers receive only proven input; policy is visible in the routes.
4. **Unknown fields: strip, reject, or allow?** Reject in contract-first
   APIs — typos surface; mass-assignment surface shrinks. Know that many
   libraries strip by default.
5. **Validation vs authorization vs business rules?** Shape at the boundary /
   identity+permission / domain policy — three layers, three homes.
6. **Zod vs express-validator?** Inference and composability vs
   middleware-chain tradition; in TS, schema inference wins.

## Summary

Validation converts `unknown` into proof at the boundary: six jobs, learned
manually, compressed into zod schemas that also *generate* the input types
(`z.infer` — the inversion), mounted as per-route middleware so controllers
only ever see parsed, transformed, contract-shaped input — with failures
answered by one aggregated 422 envelope, and the library kept off the wire by
a small mapping layer. Runtime proof and compile-time types are now the same
declaration.

## Further reading

- Alexis King, *Parse, don't validate* — https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/
- Zod docs — https://zod.dev
- express-validator docs (for recognition) — https://express-validator.github.io
