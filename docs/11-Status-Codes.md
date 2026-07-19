# 11 — Status Codes: The Contract's Vocabulary

## Definition

The status code is the response's **first machine-readable word** — the
three digits on the status line that clients, caches, monitors, and load
balancers act on before (or without) reading the body. Choosing it is not
decoration: it is the API keeping or breaking its contract.

Class rule of thumb ([02-HTTP.md](02-HTTP.md)): `2xx` we succeeded ·
`3xx` look elsewhere · `4xx` your request is wrong (fix and retry) ·
`5xx` we broke (our pager rings).

## The codes this API uses — with the reasoning

### 200 OK
Successful GET and PATCH. The body is the resource (or array). Note what
200 promises: *the request succeeded* — which is why tucking
`{"error": ...}` inside a 200 is a contract violation that breaks every
client, cache, and monitor that (correctly) trusts the status line.

### 201 Created
POST that brought a resource into existence. Three-part convention (all
implemented): 201 + `Location: /api/v1/tasks/<id>` + the complete created
resource (so the client learns server-side decisions — id, defaults,
timestamps — without a follow-up GET).

### 204 No Content
Successful DELETE. The *promise of emptiness*: no body, and therefore no
`Content-Type`/`Content-Length` (verified on our wire — the 204 response
carries neither). Implementation must use `res.status(204).end()`, never
`.json()`.

### 400 Bad Request
The request could not even be parsed: malformed JSON, wrong content
framing. Handled centrally (the error middleware re-dresses body-parser's
`SyntaxError`). Distinct from 422 by the **parse/meaning split**.

### 401 Unauthorized (Phase 10)
"Who are you?" — no/invalid credentials. Misnamed by history: it means
*unauthenticated*. Comes with `WWW-Authenticate` semantics in classic HTTP.

### 403 Forbidden (Phase 11)
"I know who you are, and no." Authenticated but not permitted. The
401/403 split mirrors authentication vs authorization.

### 404 Not Found
Two uses in our API, same envelope: unknown resource id
(`Task not found`) and unmatched route (`Cannot GET /nope`). Design
decisions recorded in the contract: an **empty collection is 200 + `[]`**,
never 404 (the collection exists); and malformed ids fall to the same
lookup-miss 404 (no separate "bad id format" branch unless Phase 6 adds
one deliberately).

### 409 Conflict (reserved)
The request is valid but collides with current state — duplicate unique
value, optimistic-concurrency version mismatch. We reserve it; it becomes
real when persistence adds uniqueness (Phase 9+).

### 422 Unprocessable Entity
Parsed fine, means something invalid: missing title, `priority: "banana"`,
empty PATCH. Always carries `details: [{field, message}]`, aggregated (all
problems in one response). The 400/422 boundary in one line: **400 = could
not read it; 422 = read it, and no.**

### 500 Internal Server Error
Our bug. Generic body (`{"error":{"message":"Internal server error"}}`),
never internals; full fidelity goes to server logs instead
([10-Error-Handling.md](10-Error-Handling.md)). Every 500 is by definition
a defect to investigate — which is exactly what makes it the right alert
trigger.

## Precedence (from the contract)

When a request is wrong several ways: **400 → 422 → 404**. Cheapest checks
first; storage is never consulted for a request that would be rejected
anyway. (Decided Phase 5, enforced naturally by pipeline order: parser →
validator → controller lookup.)

## Where codes live in the codebase

Statuses are decided at **throw sites via error types** (`NotFoundError` =
404, `ValidationError` = 422) and success sites via explicit
`res.status(...)`. The error middleware transcribes; nothing else formats.
Grep test: `status(500)` appears exactly once, in the error handler.

## Common mistakes

1. 200-with-error-body — breaks the machine-readable contract.
2. 500 for client mistakes — pages the on-call for typos; poisons alerting.
3. 404 for an empty collection — the collection exists; it's just empty.
4. Body on a 204 — spec violation, confuses strict clients.
5. Inventing precedence per endpoint — decide once, contract it.
6. 401/403 confusion — unauthenticated vs unpermitted.

## Interview questions

1. **400 vs 422?** Unparseable vs parsed-but-invalid; ours: JSON syntax →
   400, schema failures → 422 with per-field details.
2. **Why does a create return 201 + Location + body?** Semantics, standard
   pointer, and the server's decisions returned in one round trip.
3. **What must a 204 not have?** A body (and consequently content headers);
   it is the promise of emptiness.
4. **Why is alerting keyed on the 4xx/5xx split?** 4xx = client behavior
   (dashboard), 5xx = our defects (page); statuses drive operations, not
   just clients.
5. **401 vs 403?** Not authenticated vs authenticated-but-forbidden.
6. **Where should a status code be decided?** As close to the failure's
   discovery as possible, encoded in a typed error; formatted centrally.

## Summary

Ten codes carry this API's whole vocabulary: 200/201/204 for the three
success shapes, 400/422 split by parse-vs-meaning, 404 for absent
identities (never empty collections), 401/403 split by who-vs-may
(upcoming), 409 reserved for state collisions, 500 for our own bugs —
generic outward, fully logged inward, precedence 400→422→404, every choice
recorded in the contract and enforced by types at throw sites.

## Further reading

- MDN status reference — https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
- RFC 9110 §15 (status codes) — the authoritative definitions
