# Authorization

## Definition

**Authorization** decides *what an authenticated identity is allowed to do*. It
is the sequel to authentication (docs/28): authentication proves *who you are*;
authorization decides *whether you may perform this action on this resource*.
The two are separate concerns, fail in separate ways, and even have separate
status codes — **401** means *unauthenticated* ("I don't know who you are"),
**403** means *unauthorized* ("I know who you are; the answer is no").

This API's authorization model is **resource ownership**: every task carries an
`ownerId`, and the single rule is — *a user may only read or modify tasks whose
`ownerId` equals their own id*. There are no roles, no admins, no sharing (yet);
just "your tasks are yours."

## Why it exists

One running API serves many mutually-distrusting users — **multi-tenancy**.
Without authorization, authentication alone gives you a system where anyone
with *any* valid account can read and delete *everyone's* data: the door has a
lock (login) but every room inside is open. Authorization is the per-room locks.

The failure mode has a name: **IDOR** — Insecure Direct Object Reference. You
expose `/tasks/:id`, a logged-in attacker changes the id to one they don't own,
and if the server fetches by id *without checking ownership*, it hands over
someone else's data. IDOR is perennially in the OWASP Top 10 (as "Broken Access
Control"). The fix is boring and absolute: **every query is scoped by owner.**

## The core mechanism: scope the query, don't filter after

There are two ways to enforce ownership, and only one is correct:

```
WRONG (check-after):                    RIGHT (scope-the-query):
  task = findById(id)                     task = findOne({ _id: id, ownerId })
  if (task.ownerId !== me) deny           if (!task) notFound
  use(task)                               use(task)
```

The wrong version *works* until someone refactors the `if` away, or an early
return skips it, or a new endpoint forgets it. The right version makes a foreign
task **literally unfindable** — the database never returns it, so there is no
unchecked object to leak. Enforcement lives in the *shape of the query*, not in
a conditional a developer must remember to write. In this codebase the
repository makes `ownerId` a **required argument** on every read and write, so
"query tasks without saying whose" is not even a callable function.

## The design decision: 403 vs 404 for someone else's resource

When Heidi requests `GET /tasks/<carol's-task-id>` — a task that exists but
isn't hers — the server can answer two ways:

| | **403 Forbidden** | **404 Not Found** |
|---|---|---|
| Honesty | "This exists; you may not have it." | "No such task." (from your view) |
| Leaks | Confirms the id **exists** | Reveals **nothing** |
| Enumeration | Attacker can map which ids are real | Attacker learns nothing from probing |

**This API chooses 404** for resources you don't own — identical to a task that
never existed. The reason is **information disclosure**: a 403 confirms "that id
is a real task (just not yours)," which lets an attacker enumerate the existence
and count of other users' resources by probing ids and sorting 403s from 404s.
Returning 404 collapses "isn't yours" and "doesn't exist" into one answer, so a
probe reveals nothing. GitHub does exactly this — request a private repo you
can't see and you get 404, not 403, precisely so nobody can confirm the repo
exists. Google, GitLab, and most security-conscious APIs follow the same rule.

**When 403 is the right choice instead:** inside a boundary the user is already
*known* to be within — e.g. a team member hitting an admin-only action in a
project they belong to. There, the resource's existence is not a secret (they
can see the project), so 403 ("you're in the room but not allowed this switch")
is more honest and more useful than a confusing 404. The rule of thumb: **404
when revealing existence is itself a leak; 403 when existence is already known
and only the permission is in question.** For cross-user resources with no
sharing model, existence *is* the secret, so 404 wins.

Implementation note: choosing 404 is almost *free* here precisely because we
scope the query by owner. `findOne({ _id, ownerId })` returns null for both
"doesn't exist" and "isn't yours" — the same `undefined` flows up, the same
`NotFoundError` renders. The secure choice falls out of the secure mechanism.

## Internals: how ownership threads through the layers

```
requireAuth ── sets req.userId (from token sub)
     │
controller ── requireUserId(req)  ← narrows string|undefined → string
     │  passes ownerId DOWN as an explicit argument at every call
service ──── listTasks(ownerId, …) / getTaskById(id, ownerId) / …
     │
repository ─ find({ ownerId, … }) / findOne({ _id, ownerId }) /
             updateOne({ _id, ownerId }) / deleteOne({ _id, ownerId })
     │
  MongoDB ── the where-clause the whole system exists to enforce
```

`ownerId` is the *first* parameter of every repository read/write and leads the
service signatures too — a deliberate ergonomic choice so that a call missing
its owner is a type error, not a silent security hole. The write queries
(`updateOne`/`deleteOne`) are owner-scoped as well as the reads: even if a
caller's id somehow diverged between a fetch and a write, Mongo refuses to touch
a document that isn't theirs. Defense in depth on the mutation path.

## Common mistakes

1. **Check-after instead of scope-the-query** — the `if (task.ownerId !== me)`
   that a future refactor deletes. Put ownership in the query shape.
2. **Forgetting one endpoint** — access control is only as strong as its
   *weakest* route; the list endpoint that isn't scoped leaks everything. Make
   the scoped path the only callable path (required argument).
3. **403 where existence is a secret** — leaks which ids are real; enables
   enumeration of other tenants' resources.
4. **Trusting an ownerId from the client** — mass assignment (docs/28); the
   owner comes from the token, never the body.
5. **Scoping reads but not writes** — an unscoped `deleteOne({ _id })` lets a
   crafted request delete anyone's task even if reads are locked down.
6. **Confusing 401 and 403** — re-authenticating won't fix a 403 (you're
   already known); getting a fresh token won't fix a 401-worthy expired one.

## Best practices

- Enforce ownership in the **query**, not in post-fetch conditionals.
- Make the owner a **required argument** so unscoped access won't compile.
- Default to **404** for cross-user resources where existence is sensitive;
  reserve **403** for "known to be inside, lacks this specific permission."
- Source the owner from the **verified token**, never from client input.
- Scope **every** operation — reads and writes — not just the obvious ones.
- Index the owner field: it's in every query's where-clause (docs/27).

## Interview questions

1. **Authentication vs authorization?** Authn = who you are (401 if unknown);
   authz = what you may do (403 if denied). Authz builds on authn's result.
2. **What is IDOR / Broken Access Control?** Serving a resource by id without
   verifying the caller owns it; the attacker swaps the id for one they don't
   own. Fix: scope every query by owner.
3. **403 or 404 for a resource that exists but isn't yours — and why?** Prefer
   404 when the resource's *existence* is itself sensitive (prevents
   enumeration); 403 when the caller is already known to be within the boundary
   and only the permission is in doubt.
4. **Why scope the query instead of checking after fetching?** The check-after
   is a conditional a developer can remove or skip; a scoped query makes the
   foreign resource unfetchable — enforcement is structural, not remembered.
5. **Where does the owner id come from, and why not the request body?** From
   the authenticated token; a body-supplied owner is mass assignment (plant
   resources in another account).

## Summary

Authorization turns an authenticated identity into enforced boundaries:
every task has an `ownerId`, and every read and write is scoped by it in the
*query itself*, so another user's task is unfetchable rather than
fetched-then-rejected. Cross-user resources return **404, not 403**, so probing
ids reveals nothing about what exists — the same discretion GitHub applies to
private repos. The owner threads down from the token through required arguments
at every layer, making an unscoped operation a compile error rather than a
latent IDOR. Authentication built the lock on the front door; authorization put
locks on every interior room and made "your tasks are yours" a property the type
system and the database jointly enforce.

## Further reading

- OWASP Top 10: A01 Broken Access Control — the category IDOR lives in
- OWASP Authorization Cheat Sheet — patterns and anti-patterns
- OWASP IDOR Prevention Cheat Sheet
- The GitHub 404-for-private-resources convention (search: "GitHub 404 private
  repository access control") — the enumeration-defense rationale in the wild
