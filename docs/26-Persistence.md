# 26 — Persistence: Files First, Databases Next

## Definition

**Persistence is state that outlives the process.** Until Phase 8 our tasks
lived in a module-scoped array — truth with the lifespan of a `tsx` restart.
Now the repository layer writes through to a JSON file: the file is the
truth **at rest**, an in-process cache is the truth **at runtime**, and five
async functions form the contract between the two worlds and the service
above.

```
services/tasks.service.ts        rules, orchestration (async)
        │  findAll / findById / insert / update / remove   ← THE CONTRACT
        ▼
database/tasks.repository.ts     cache + write-through
        │
        ▼
data/tasks.json                  truth at rest (gitignored: state ≠ source)
```

## Why files first (the pedagogy that is also real engineering)

A database hides the hard questions of durability. A file makes you answer
them yourself — and the answers ARE the concepts databases are built from:

| Question the file forces | Our answer | The database concept it becomes |
|---|---|---|
| What if the process dies mid-write? | temp file + atomic `rename()` | write-ahead logs, journaling |
| What if two writes interleave? | serialize via a promise-chain queue | locks, MVCC, transactions |
| What if the data is corrupted at boot? | throw loudly, never auto-wipe | crash recovery, integrity checks |
| Who owns the cached copy? | exactly one process | the DB server as single authority |
| How do I find one record? | linear scan of everything | indexes |

## The techniques, named

### Atomic replacement (torn-write protection)

```
writeFile("tasks.json.tmp", data)   ← crash here: real file untouched
rename("tasks.json.tmp" → "tasks.json")   ← atomic on same filesystem
```

A crash can lose the *latest* write but can never leave a half-written
file. Readers observe old-or-new, never a mix. This exact dance appears in
text editors, SQLite checkpoints, and package managers — it is the
foundational unit of crash-safe file I/O.

### Write serialization (interleave protection)

```ts
let writeQueue: Promise<void> = Promise.resolve();
function persist(snapshot) {
  const serialized = JSON.stringify(snapshot);   // ← serialize NOW
  writeQueue = writeQueue.then(() => writeToDisk(serialized));
  return writeQueue;
}
```

A promise chain is a queue: each write starts only after the previous one
finishes. Two subtleties: (1) serialization happens at *mutation* time, so
later mutations can't alter what an earlier queued write records; (2) this
is lock-free only because JS is single-threaded — the chain reassignment
can't race.

### The cache model — and its expiry date

Reads never touch disk after first load; mutations write through. Correct
**if and only if one process owns the file.** Run two API instances against
one file and each instance's cache lies about the other's writes — the
precise failure that makes "just use files" stop scaling and makes a
database (one authoritative server, many clients) the next step.

### Error posture

- `ENOENT` on first read → empty store (a missing file is a fine, expected
  state on first boot).
- Anything else — corrupted JSON above all — **throws**. Auto-recovering to
  `[]` would silently destroy every task the user ever wrote. A failure to
  stop is worse than a failure to start; the Phase 7 pipeline turns the
  throw into a logged 500 while the data stays on disk for a human to fix.

## Async propagation (what Phase 8 did to the codebase)

I/O sits at the bottom, so `fs/promises` makes the repository async, which
makes the service async, which makes the controllers `await` — one `async`
at the bottom re-colors every signature above it ("function coloring").
Express 5's automatic async error forwarding (Phase 7) is what makes this
safe: a disk failure rejects, climbs the layers, and lands in the error
middleware as a logged 500. In Express 4 that same failure, unwrapped,
hung the request.

## When files ARE the right production answer

Not just a teaching device — file storage is legitimately correct for:
single-writer tools (CLIs, desktop apps — SQLite's home turf), config and
small append-only logs, and embedded/edge contexts. The decision axis:
**number of concurrent writers and query complexity.** One writer + whole-
dataset reads → files are simple and honest. Many writers, partial queries,
or multiple processes → database.

## Known limitations of our implementation (accepted, scheduled)

1. **Whole-file writes** — every mutation rewrites all tasks: O(n) per
   write. Fine for hundreds; absurd for millions. (DBs write deltas.)
2. **Linear scans** — `findById` is O(n). (DBs: indexes.)
3. **Single process only** — the cache model forbids horizontal scaling,
   which [02-HTTP.md](02-HTTP.md) told us is Node's scaling story. (DBs:
   the server is the shared authority.)
4. **Filtering in application memory** — we load everything, then filter.
   (DBs: the query runs where the data lives.)

Phase 9 doesn't delete this file's lessons — MongoDB is these same answers,
industrialized.

## Common mistakes

1. Direct overwrite without temp+rename — one crash from corruption.
2. Unserialized writes — corruption that only appears under load.
3. Auto-wiping corrupted data — silent total loss; crash loudly.
4. Treating all read errors as "no file" — only `ENOENT` means that.
5. In-process cache with multiple processes — every cache lies.
6. Sync `fs` calls in request paths — blocks every request in the process.
7. Committing runtime data — state is not source; `data/` is gitignored
   like `node_modules/` and `dist/`.

## Interview questions

1. **How do you make a file write crash-safe?** Write a temp file, then
   atomically rename over the target; readers see old-or-new, never torn.
2. **How do you prevent interleaved async writes without locks?** Chain
   writes on a promise queue; single-threaded JS makes the chain itself
   race-free.
3. **When does an in-process cache over a file break?** The moment a second
   process writes the same file; caches need a single owner or a
   coordinating server.
4. **Why does adding I/O at the bottom change every function above it?**
   Non-blocking I/O returns promises; awaiting propagates async through
   the call chain.
5. **When are files the right storage choice in production?** Single
   writer, simple whole-dataset access patterns; beyond that, a database.

## Summary

Persistence arrived as five async functions over a JSON file — atomic via
temp+rename, serialized via a promise queue, cached under a single-owner
rule, honest about corruption — and the act of building it by hand surfaced
exactly the problems (torn writes, interleaving, shared state, scans) that
databases exist to industrialize. The repository contract is now the seam:
Phase 9 swaps what's beneath it and nothing above notices.

## Further reading

- `man 2 rename` / MSDN MoveFileEx — the atomicity guarantee itself
- SQLite: *How To Corrupt Your Database* — a masterclass in file-durability
  thinking: https://www.sqlite.org/howtocorrupt.html
- Files vs databases: Designing Data-Intensive Applications (Kleppmann),
  ch. 3 — from log files to B-trees
