# 25 — TypeScript on the Backend

## Definition

**TypeScript is a statically-typed superset of JavaScript that compiles to plain
JavaScript.** Every JS program is a valid TS program; TS adds a *type layer* that
exists only at development time. At runtime there is no TypeScript — Node executes
the compiled JavaScript, and every type annotation has been erased.

The core mental model:

```
           WRITE                    COMPILE                    RUN
   ┌──────────────────┐    ┌──────────────────────┐    ┌────────────────┐
   │  src/server.ts   │───►│  tsc (type-checks,   │───►│ dist/server.js │
   │  types, imports  │    │  erases types, emits │    │  plain JS, run │
   │                  │    │  CommonJS)           │    │  by Node/V8    │
   └──────────────────┘    └──────────────────────┘    └────────────────┘
        compile-time errors caught HERE ▲          runtime errors still exist ▲
```

Types are a **compile-time contract**, not a runtime guarantee. `JSON.parse` of a
network body can still contain anything — which is why runtime validation
(Phase 6) exists *in addition to* types. Types protect you from your own code;
validation protects you from other people's data.

## History

- **2012** — Microsoft releases TypeScript (Anders Hejlsberg, also creator of C#).
  Goal: make large-scale JavaScript maintainable.
- **2015–2018** — Angular adopts TS; VS Code (itself written in TS) makes the
  editor experience mainstream.
- **2019–2023** — TS becomes the default for new backend Node projects in industry;
  DefinitelyTyped (`@types/*`) covers virtually every popular package.
- **2024+** — Node gains native type-stripping experiments; the TS compiler itself
  is being ported to native code (TypeScript 7, Go-based) for ~10× speed. The type
  *system* is unchanged — the ecosystem is investing in making it faster, not
  replacing it.

## Why it exists — the problem it solves

JavaScript's flexibility becomes a liability at scale:

```js
// Plain JS — all of these are runtime bombs, silent until production:
task.titel            // typo → undefined, no error until something uses it
completeTask(task.id) // did this expect an id or the whole task? read the source…
task.dueDate.getTime() // dueDate was a string all along → TypeError at 2 AM
```

TypeScript turns each of those into a **red squiggle before the code ever runs**.
For a backend this matters double:

1. **A backend is contracts all the way down** — request shapes, response shapes,
   database documents, function signatures between layers (controller → service →
   storage). TS lets us *write the contract down once* (`interface Task`) and have
   every layer checked against it.
2. **Refactoring safety** — rename a field on `Task` and the compiler lists every
   line in every layer that must change. In plain JS you find those lines in
   production logs.
3. **Self-documentation** — a typed function signature answers "what do I pass and
   what do I get back" without reading the body. Onboarding speed at companies is
   measurably better on typed codebases.

## How it works internally (this project's pipeline)

Two separate tools consume our `.ts` files:

- **`tsc`** (the TypeScript compiler) — the *checker and builder*. `npm run build`
  runs it: type-checks everything, then emits plain JS + source maps to `dist/`.
  `npm run typecheck` (`tsc --noEmit`) checks without emitting — CI's best friend.
- **`tsx`** — the *dev runner*. `npm run dev` = `tsx watch src/server.ts`: strips
  types on the fly (esbuild under the hood), runs Node, restarts on save.
  Crucial nuance: **tsx does not type-check** — it only strips types, because
  stripping is ~100× faster than checking. The red squiggles in your editor come
  from the TS language server; the *authoritative* check is `tsc`. Dev loop =
  fast (tsx); truth = `tsc`; production runs only compiled JS from `dist/`.

Type declarations for JS packages come from `@types/*` packages (the
DefinitelyTyped project): Express ships as plain JS, `@types/express` overlays the
type information. `@types/node` does the same for Node's built-ins — it's how the
compiler knows what `http.createServer` returns.

### Module-system resolution (how TS + CommonJS coexist)

We write modern `import` syntax in `.ts` files; because `tsconfig.json` says
`"module": "commonjs"`, the compiler emits `require()` calls. Verified in our own
build output:

```
src/server.ts:   import http from 'node:http';
dist/server.js:  const node_http_1 = __importDefault(require("node:http"));
```

Best of both: modern syntax in source, maximum-compatibility CommonJS at runtime.

## Our tsconfig.json, decision by decision

| Option | Value | Why |
|---|---|---|
| `target` | `ES2022` | Emit modern JS — Node 22 understands it natively; no down-leveling waste. |
| `module` | `commonjs` | Emit `require`/`module.exports` — our runtime module decision. |
| `rootDir` / `outDir` | `src` / `dist` | Source and build output never mix; `dist/` is gitignored (generated ≠ source). |
| `strict` | `true` | Umbrella for all strictness flags (`strictNullChecks`, `noImplicitAny`, …). **Non-negotiable on new projects** — loose TS gives the costs of TS with few of the benefits. |
| `noUncheckedIndexedAccess` | `true` | `array[i]` is `T \| undefined`, not `T` — forces handling the miss. Painful, worth it. |
| `noUnusedLocals` / `noUnusedParameters` | `true` | Dead code fails the build instead of accumulating. |
| `esModuleInterop` | `true` | Makes `import express from 'express'` work smoothly with CommonJS packages. |
| `sourceMap` | `true` | Stack traces in production point at `.ts` lines, not compiled `.js` lines. |
| `skipLibCheck` | `true` | Don't re-check every `node_modules` declaration file — big speed win, standard practice. |
| `forceConsistentCasingInFileNames` | `true` | Windows/macOS are case-insensitive, Linux servers are not; catches `./Task` vs `./task` before deploy breaks. |
| `include: ["src"]` | | Only our source is compiled. |

## `any` vs `unknown` — the distinction that matters most on a backend

- `any` — "turn the type system off for this value." Errors propagate silently.
  Treat every `any` as a bug you haven't had yet.
- `unknown` — "I genuinely don't know what this is **and the compiler will make me
  prove it before I use it**."

Network input is the canonical case, straight from our server:

```ts
let body: unknown;             // JSON.parse returns any — we immediately demote it
body = JSON.parse(raw);
// body.title  ← compile error: 'body' is of type 'unknown'
// We must narrow (typeof checks / validation) before touching it. Phase 6
// introduces schema validation, which does exactly this narrowing at runtime.
```

Rule: **external data enters the system as `unknown` and only becomes a real type
after runtime validation.** Types + validation together give end-to-end safety.

## Production use

- The dominant pattern for new Node services at companies of every size: strict TS,
  CI gate = `tsc --noEmit` + tests; deploy artifact = compiled `dist/` (production
  containers run plain Node — no TS tooling in production).
- Shared type packages let separate services (or frontend + backend) agree on API
  contracts at compile time.
- Typical incident postmortem line TS eliminates: "the field was renamed in one
  service but not the other."

## Common mistakes

1. **Sprinkling `any` to silence errors** — deletes exactly the protection you
   installed TS for. Prefer `unknown` + narrowing.
2. **Trusting types at runtime boundaries** — an interface does not validate a
   request body. Types are erased; attackers don't read your interfaces.
3. **Running with strict off** ("we'll enable it later") — retrofitting strict onto
   a codebase is 10× the pain of starting strict.
4. **Committing `dist/`** — build output in git guarantees merge conflicts and
   stale-build bugs. Build in CI/deploy instead.
5. **Assuming the dev runner type-checks** — tsx/esbuild only strip types. A
   project can *run* in dev while `tsc` fails. Always gate on `typecheck`.
6. **Forgetting `@types/*` for a JS dependency** — the import works but everything
   from it is implicitly `any` (strict mode surfaces this as an error).

## Best practices

- `strict: true` from day one; treat `tsc --noEmit` as a required gate.
- Model the domain once (`interface Task`) and import it everywhere — single
  source of truth for shapes (ours will live in `src/types/`).
- `unknown` at every boundary (HTTP bodies, DB results, env vars), narrow with
  validation.
- Keep `tsconfig.json` small and intentional — every flag should have a reason you
  can state (this document *is* those reasons).

## Interview questions

1. **Does TypeScript exist at runtime?** No — types are erased at compile time;
   Node runs plain JS. Hence runtime validation is still required for external data.
2. **`any` vs `unknown`?** Both accept anything; `any` disables checking on use,
   `unknown` forbids use until you narrow the type. Use `unknown` for untrusted data.
3. **Why can code run under tsx/ts-node but fail `tsc`?** Dev runners strip types
   without checking; `tsc` is the authoritative checker.
4. **What does `strict: true` enable?** A bundle including `noImplicitAny` (no
   silent `any`), `strictNullChecks` (null/undefined must be handled explicitly),
   `strictFunctionTypes`, and more.
5. **How do types for plain-JS packages like Express work?** Community-maintained
   declaration packages (`@types/express` from DefinitelyTyped) overlay type
   signatures onto the JS implementation.

## Summary

TypeScript adds a compile-time type layer that is erased before Node ever runs the
code: `tsc` checks and builds to `dist/`, `tsx` gives a fast dev loop, `@types/*`
supplies types for JS packages. Strict mode is on from day one; external data is
`unknown` until validated. Types document and enforce the contracts between the
layers we're about to build — and they complement, never replace, runtime
validation.

## Further reading

- The TypeScript Handbook — https://www.typescriptlang.org/docs/handbook/intro.html
- tsconfig reference — https://www.typescriptlang.org/tsconfig
- Total TypeScript (Matt Pocock) — https://www.totaltypescript.com (best modern deep-dives)
