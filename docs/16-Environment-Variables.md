# 16 — Environment Variables & Configuration

## Definition

**Environment variables are key–value strings the operating system attaches to
every process at launch.** They are the standard channel for passing
configuration *into* a program from *outside* the program. In Node they appear
as `process.env.NAME`, and every value is a `string | undefined` — the
environment has no numbers, booleans, or validation. Turning those raw strings
into trustworthy typed values is our job (and this project does it in exactly
one place: [`src/config/index.ts`](../src/config/index.ts)).

## History

- **1979** — environment variables appear in Unix Version 7; every process
  inherits a copy of its parent's environment. `PATH` and `HOME` are the same
  mechanism you're using for `PORT`.
- **2011** — Heroku's engineers publish **The Twelve-Factor App**; Factor III
  ("Config") canonizes the rule: *store config in the environment, strictly
  separate from code*. This became the industry default for cloud deployment.
- **2013+** — `dotenv` (Ruby, then Node) bridges the developer-experience gap:
  a `.env` file that *simulates* real environment variables locally.
- **Node 20+** — Node gains native `--env-file=.env` support; the dotenv package
  remains the ecosystem default and is what we use.

## Why this exists — the problem

The port was hardcoded: `const PORT = 3000`. Three forces make that untenable:

1. **Environments differ.** Your laptop, a teammate's laptop, CI, staging, and
   production each need different values — ports, database URLs, log levels.
   Code should be *identical* everywhere (one build artifact); only config varies.
2. **Secrets must never live in code.** A database password in a source file is
   one `git push` from being permanent public history (see
   [01's](01-Introduction.md) trust boundary and .gitignore rationale). The
   environment is outside the repository by construction.
3. **Deploy-time flexibility.** Hosting platforms *tell you* your port via
   `process.env.PORT`. Hardcode 3000 and your app simply doesn't start on them.

```
   ONE build artifact            MANY environments
  ┌────────────────┐    ┌──────────────────────────────────┐
  │  compiled app  │ +  │ dev:   PORT=3000, DB=localhost   │
  │  (identical    │    │ CI:    PORT=3100, DB=test-db     │
  │   everywhere)  │    │ prod:  PORT=8080, DB=aws-rds…    │
  └────────────────┘    └──────────────────────────────────┘
        code                     environment
```

## How it works — the three layers

### 1. `process.env` (the OS truth)

Every variable set in the shell that launched Node is present:
`$env:PORT='4001'; node server.js` → `process.env.PORT === '4001'`.

### 2. `dotenv` (the local convenience)

`import 'dotenv/config'` runs dotenv's loader at import time: it reads `.env`
from the working directory, parses `KEY=value` lines, and copies them into
`process.env` — **but never overwrites a variable that already exists**. That
precedence is deliberate and correct:

```
real environment  >  .env file  >  defaults in code
(deploy platform)    (local dev)   (parsePort's 3000)
```

We *proved* this: with `.env` saying 3000 and the shell exporting `PORT=4001`,
the server listened on 4001.

`.env` is for **local development only**. Production platforms inject real
environment variables (dashboard settings, secret managers, container env);
there is no `.env` file on a production box, and dotenv silently does nothing
if the file is absent — which is exactly why it's safe to leave the import in.

### 3. The config module (the trust boundary for config)

`process.env` values are untrusted strings — the same boundary rule as request
bodies ([25-TypeScript.md](25-TypeScript.md)). Our
[`src/config/index.ts`](../src/config/index.ts):

- is the **only** file allowed to touch `process.env` — one obvious place to
  see every knob the app has;
- **parses and validates** each value (`PORT` must be an integer 1–65535,
  `NODE_ENV` must be one of three known strings);
- applies defaults explicitly (3000, `development`);
- **fails fast**: invalid config throws *at startup*, killing the process with
  a clear message — verified live:
  `Error: Invalid PORT "abc" — expected an integer between 1 and 65535`.

Fail-fast is a production principle worth internalizing: a service that starts
with broken config doesn't fail at startup — it fails at the *worst possible
moment*, on the first request that needs the value, possibly hours later. A
crash at boot is caught by deploy tooling and rolled back automatically; a
latent misconfiguration becomes an outage.

### The `.env` / `.env.example` pair

| File | Committed? | Contains |
|---|---|---|
| `.env` | **never** (gitignored since Step 1.1) | real local values, later secrets |
| `.env.example` | always | variable *names*, safe defaults, comments |

`.env.example` is executable documentation: a new engineer runs
`cp .env.example .env` and knows every variable the app needs without asking a
teammate or hunting through code.

## `NODE_ENV` — the conventional mode switch

A convention the entire ecosystem reads: `development` | `production` | `test`.
Express itself changes behavior on it (production mode disables the leaky HTML
error pages we captured in [05-Express.md](05-Express.md) and enables view
caching); libraries log more or less; our own code will branch on it (verbose
errors in dev, terse in prod — Phase 7). It's a *string with an ecosystem-wide
contract*, which is why our config validates it against the three known values
instead of accepting anything.

## Production use

- Platforms (Render, Railway, Heroku, AWS, Kubernetes) inject env vars from
  dashboards/manifests; secrets come from **secret managers** (AWS Secrets
  Manager, Vault) that inject at boot — engineers never see production
  passwords at all.
- CI sets `NODE_ENV=test` and its own DB URLs.
- The build artifact (our `dist/`) is promoted unchanged from staging to
  production; *only the environment differs*. That's Twelve-Factor Factor III
  working as intended.

## Common mistakes

1. **Committing `.env`** — the classic secret leak; ours has been gitignored
   since before it existed.
2. **Reading `process.env` all over the codebase** — no single source of truth,
   no validation, and `process.env.PROT` (typo!) is silently `undefined`.
   Centralize in one config module; a typo'd import fails to compile instead.
3. **Forgetting every env value is a string** — `process.env.PORT === 3000` is
   always false; `if (process.env.FEATURE)` is true for the string `"false"`.
   Parse explicitly.
4. **Defaulting secrets** — a fallback like `JWT_SECRET ?? 'dev-secret'` will
   eventually run in production. Defaults are for harmless knobs (port); secrets
   must fail fast when missing.
5. **Loading dotenv after config is read** — import order matters;
   `import 'dotenv/config'` sits at the very top of the config module.
6. **Expecting `.env` to override the real environment** — precedence is the
   other way, by design.

## Best practices

- One config module; the rest of the app imports typed values, never `process.env`.
- Validate at startup, fail fast, with error messages that name the variable and
  the expected shape.
- Keep `.env.example` in lockstep with the config module — every variable the
  module reads appears there with a comment.
- Group future config by concern (server, database, auth) as the module grows.

## Interview questions

1. **Why environment variables instead of a config file in the repo?** Config
   varies per environment and may be secret; the repo is identical everywhere
   and permanent. (Twelve-Factor III.)
2. **What does dotenv do, and does it run in production?** Loads `.env` into
   `process.env` at import time without overwriting existing vars; in production
   there's typically no `.env` and it's a no-op — platform-injected vars rule.
3. **What's the precedence between real env vars and `.env`?** Real environment
   wins; dotenv never overwrites.
4. **Why fail fast on invalid config?** A boot crash is caught by deploy
   tooling; a latent bad value surfaces mid-traffic as an outage.
5. **What type is `process.env.X`?** `string | undefined` — always. Parsing and
   validation are the application's responsibility.
6. **What is `NODE_ENV`?** An ecosystem-wide convention for runtime mode;
   frameworks (including Express) change behavior on it.

## Summary

Configuration lives outside code: the OS environment carries it, dotenv
simulates it locally from an uncommitted `.env`, and a single typed config
module validates every value at startup and fails fast on garbage. Real
environment beats `.env` beats defaults. `.env.example` documents the contract.
From now on, no file in this project reads `process.env` except
`src/config/index.ts` — and no value crosses from the environment into the app
without being parsed and validated first.

## Further reading

- The Twelve-Factor App, Factor III — https://12factor.net/config
- dotenv README — https://github.com/motdotla/dotenv
- Node docs: `--env-file` — https://nodejs.org/api/cli.html#--env-fileconfig
