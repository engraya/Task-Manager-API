# Authentication

## Definition

**Authentication** answers exactly one question: *who is making this request?*
It is distinct from **authorization** (*is this identity allowed to do this?* —
Phase 11). The two are so often confused that the status codes encode the
difference: **401 Unauthorized** actually means *unauthenticated* ("I don't
know who you are"), while **403 Forbidden** means *unauthorized* ("I know who
you are, and no"). The 401 name is a historical misnomer the web is stuck with.

In this API, authentication is three cooperating pieces:

1. **Registration** — turning a password into a bcrypt hash and a stored User
2. **Login** — verifying credentials and issuing a signed, expiring JWT
3. **The gate** — middleware that verifies the JWT on every protected request

## History

- **1970s** — Unix `crypt(3)`: the insight that systems should store password
  *hashes*, not passwords, predates the web entirely.
- **1994** — Netscape ships the cookie; the **session** pattern (server-side
  state, cookie carries a session id) dominates for two decades.
- **1999** — bcrypt published (Provos & Mazières), built on Blowfish with a
  tunable cost — the first mainstream *deliberately slow* password hash.
- **2010** — RFC 5849/6749 era: OAuth formalizes token-based delegation.
- **2012** — Bearer tokens standardized (RFC 6750).
- **2015** — **JWT** standardized (RFC 7519); stateless verification becomes
  the default for APIs serving SPAs and mobile clients.
- **2015** — argon2 wins the Password Hashing Competition; it is the modern
  recommendation for new systems (see *bcrypt vs argon2* below).

## Why it exists

HTTP is **stateless**: the protocol has no memory of who you are between
requests. Any notion of "logged in" must be built *on top of* HTTP by making
every request carry proof of identity. The two architectures differ only in
*where the proof's meaning lives*:

| | Sessions | Tokens (JWT) |
|---|---|---|
| Server stores | session table (id → user) | **nothing** |
| Request carries | opaque session id (cookie) | self-contained signed claims |
| Verification | database/store lookup | pure computation (HMAC + clock) |
| Horizontal scaling | needs shared session store | any instance verifies any token |
| Instant revocation | delete the session row | **impossible** — wait for `exp` |
| Payload readable? | nothing to read | yes — signed, not encrypted |

Neither is "better": sessions buy revocability with state; tokens buy
statelessness with revocability. This API chose tokens; the damage cap for
the lost revocability is a short lifetime (1 hour).

## Internals

### Password storage: hashing, salt, cost

A password hash must be three things:

1. **One-way** — the password cannot be recovered from the hash.
2. **Salted** — a random per-user value is mixed in, so identical passwords
   produce different hashes and precomputed "rainbow tables" are useless.
   bcrypt generates and embeds the salt in the hash string itself.
3. **Slow, tunably** — this is the counterintuitive one. Fast hashes (SHA-256)
   are *disqualified* for passwords: an attacker with a leaked database can
   try billions of SHA-256 guesses per second, but only a handful of bcrypt
   guesses. Our cost of 12 ≈ 250 ms per attempt — irrelevant to one login,
   ruinous to a billion guesses. The cost is stored in the hash, so it can be
   raised as hardware improves without invalidating old hashes.

A bcrypt hash is self-describing:

```
$2b$12$LJ3m4xI0eZ9vKq8yTn5C1uXw...
 │   │  └──────────┬──────────────
 │   │        salt + hash (base64-ish)
 │   └── cost factor (2^12 rounds)
 └────── algorithm version
```

**bcrypt vs argon2** (the promised contrast): bcrypt's weakness is that it
uses little memory (~4 KB), so GPUs and ASICs — which have thousands of
cores but limited fast memory per core — parallelize it fairly well.
**argon2id** is *memory-hard*: each hash demands tens of megabytes, which
strangles GPU parallelism. For a brand-new system, argon2id is the modern
recommendation (OWASP's first choice); bcrypt remains entirely respectable,
universally supported, battle-tested since 1999 — and its famous quirk (only
the first **72 bytes** of input count) is why our register schema caps
passwords at 72. We teach bcrypt because you will meet it everywhere; know
that argon2id is where new greenfield systems should start.

### The JWT: header.payload.signature

```
eyJhbGciOiJIUzI1NiJ9 . eyJpYXQiOjE3ODQ0OTI0ODgs... . Yx8f2kQ...
└──── header ───────┘ └──────── payload ─────────┘ └─ signature ─┘

header    = base64url({ "alg": "HS256", "typ": "JWT" })
payload   = base64url({ "iat": ..., "exp": ..., "sub": "<user id>" })
signature = HMAC-SHA256(header + "." + payload, JWT_SECRET)
```

The two facts everyone learns too late:

- **A JWT is readable by anyone.** base64url is encoding, not encryption —
  decode the middle segment with `Buffer.from(seg, 'base64url')` and read it.
  Therefore: no secrets in payloads, ever. Ours carries only `sub` (whose
  token this is), `iat`, and `exp`.
- **A JWT is unforgeable without the secret.** Change one payload byte and
  the HMAC no longer matches; producing a matching signature requires
  `JWT_SECRET`. Signed-not-secret is the entire design.

Verification is *stateless*: recompute the HMAC, compare, check `exp` against
the clock. No database. That is why any instance behind a load balancer can
verify any token — and why a signed token cannot be un-signed (no server-side
logout). Expiry is the only damage cap, hence short lifetimes.

**`alg` and the "none" attack:** the header names the algorithm, and early
libraries would *obey* a header claiming `"alg": "none"` — accepting
unsigned tokens as valid. Modern libraries (including jsonwebtoken) pin the
expected algorithm server-side. The lesson generalizes: never let the
attacker's input choose your verification procedure.

### The request-side flow (this codebase)

```
POST /api/v1/auth/login                     GET /api/v1/tasks
        │                                   Authorization: Bearer <token>
        ▼                                           │
find user by email ──not found──┐                   ▼
        │                       │       requireAuth middleware
        ▼                       ▼       ├─ header missing/non-Bearer → 401
bcrypt.compare(pw, hash)   compare vs   ├─ jwt.verify fails         → 401
        │                  DUMMY_HASH   ├─ payload shape wrong      → 401
   match?│                      │       └─ req.userId = payload.sub → next()
    yes  │  no ──── 401 ◄───────┘                   │
        ▼        (same message,                     ▼
jwt.sign({}, secret,   same duration)      controllers / services
  { subject: user.id,                     (never see anonymous requests)
    expiresIn: '1h' })
        ▼
   200 { token }
```

### Side channels: enumeration and timing

Login failure must not reveal *which half* failed — "no account with that
email" lets an attacker map the user base (then phish or credential-stuff
confirmed accounts). But fixing the **message** is not enough: without care,
"unknown email" returns in ~5 ms (no bcrypt ran) while "wrong password"
takes ~250 ms (bcrypt ran) — the **clock leaks what the words hide**. The
fix: the unknown-email path burns one bcrypt compare against a throwaway
`DUMMY_HASH`. Measured in this project: 472 ms vs 505 ms — indistinguishable.
Information leaks through *behavior* (time, size, error shape), not just
content; this is the project's first side-channel defense.

## Production use

- **Secrets are config, fail-fast, no default** — a defaulted signing secret
  means every deployment can forge every other's logins. Ours is required,
  ≥ 32 chars, generated with `crypto.randomBytes(32).toString('hex')`.
  Rotate on any suspicion of exposure (rotation invalidates all live tokens
  — with 1-hour lifetimes that is a minor event, which is itself an argument
  for short lifetimes).
- **Refresh tokens** — production systems pair short-lived access tokens
  (minutes) with long-lived refresh tokens stored server-side, regaining
  revocability at the refresh boundary. Ours uses re-login as the refresh
  mechanism until that flow exists.
- **Denylists** — instant revocation for stateless tokens requires a store
  of revoked token ids checked on every request: state, reintroduced. Every
  such addition is a conscious purchase of control with statelessness.
- **HTTPS is assumed everywhere** — a Bearer token in cleartext HTTP is a
  stolen login. "Bearer" means possession *is* the credential.
- **Where clients keep the token** — memory > `localStorage` (XSS-readable);
  `httpOnly` cookies trade XSS-safety for CSRF concerns. A frontend-course
  topic, but know the axis exists.

## Common mistakes

1. **`jwt.decode()` on an auth path** — reads the payload *without checking
   the signature*; accepts any forgery. Auth uses `verify`, always.
2. **Secrets in payloads** — the payload is public (and goes stale).
3. **Fast hashes (SHA-256/MD5) for passwords** — billions of guesses/sec.
4. **Specific login errors** — user enumeration via message…
5. **…or via timing** — same enumeration via the clock; equalize both.
6. **Long/non-expiring tokens** — no revocation exists; `exp` is the cap.
7. **Defaulted or short signing secrets** — forgery-as-a-service.
8. **Password policy enforced at login** — policy is register's business;
   login answers only "does it match?" (and even validation rules can leak).
9. **Per-route auth guards copy-pasted** — the forgotten sixth route is the
   classic bypass; mount the gate router-level so protection is the default.
10. **Trusting a verified payload's shape** — the signature proves the token
    is *yours*, not that it looks like you expect. Narrow before reading.

## Best practices

- Hash with bcrypt (cost ≥ 12) or argon2id; raise cost as hardware improves.
- Cap password length honestly at the algorithm's real limit (72 for bcrypt).
- One vague 401 for every credential failure; equalize its timing.
- Minimal claims: `sub`, `exp`, `iat`. Short lifetimes (minutes–hours).
- Verify with the algorithm pinned server-side; flatten all verify errors
  into one client-facing 401 (log the specifics server-side only).
- Type the authenticated identity honestly (`req.userId?: string` via module
  augmentation — optional, because only gated routes have it).
- Keep the bootstrap boundary explicit: know exactly which routes are public.

## Interview questions

1. **Is a JWT encrypted?** No — base64url-encoded and signed. Readable by
   anyone; forgeable by no one without the secret.
2. **Why must password hashing be slow?** The defender pays the cost once
   per login; the attacker pays it per guess. Slowness is the security.
3. **bcrypt vs argon2?** bcrypt: battle-tested, everywhere, low memory (so
   GPUs parallelize it), 72-byte input limit. argon2id: memory-hard (GPU-
   hostile), PHC winner, the modern default for new systems.
4. **How does token auth scale horizontally?** Verification is stateless
   computation; no shared session store — any instance verifies any token.
5. **The fundamental trade-off of stateless tokens?** No server-side
   revocation. Mitigations (short `exp`, refresh tokens, denylists) each
   buy back control by reintroducing state.
6. **Why one vague, timing-equalized 401?** Message leaks and timing leaks
   are the same vulnerability (user enumeration) through different channels.
7. **401 vs 403?** 401 = unauthenticated (identity unknown/unproven);
   403 = unauthorized (identity known, permission denied).
8. **What was the JWT `alg:none` attack?** Libraries obeyed a header
   claiming no algorithm, accepting unsigned tokens. Never let input choose
   the verification procedure; pin the algorithm.

## Summary

Authentication builds "who are you?" on top of a stateless protocol.
Passwords are stored only as salted, deliberately-slow bcrypt hashes (cost
12 ≈ 250 ms — the slowness *is* the defense). Login answers every failure
with one vague 401 whose timing is equalized against user enumeration, and
success issues a JWT: readable-not-forgeable claims (`sub`, `iat`, `exp`)
signed with a fail-fast-required secret. A router-level middleware gate
verifies signature and expiry statelessly on every protected request and
records the caller as a typed `req.userId`. What the system still lacks is
*authorization* — knowing who is calling is not the same as caring what
they're allowed to touch. That is Phase 11.

## Further reading

- RFC 7519 (JWT) · RFC 6750 (Bearer tokens) — the primary sources
- [jwt.io](https://jwt.io) — decode tokens interactively (dev tokens only!)
- OWASP Password Storage Cheat Sheet — the argon2id/bcrypt guidance
- OWASP Authentication Cheat Sheet — enumeration, timing, error handling
- Provos & Mazières, *A Future-Adaptable Password Scheme* (1999) — the
  bcrypt paper; short and genuinely readable
