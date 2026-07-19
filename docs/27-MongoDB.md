# 27 — MongoDB & Mongoose

## Definition

**MongoDB is a document database**: it stores JSON-like records (**documents**,
encoded as BSON) in **collections**, without a fixed table schema. Our
`taskmanager` database has a `tasks` collection whose documents look almost
exactly like our API's Task representation — which is the practical reason
document stores pair naturally with JSON APIs: the wire shape and the storage
shape are cousins, not translations.

**Mongoose is an ODM** (Object-Document Mapper) over the official driver:
models with schemas, query builders, and lifecycle hooks. Model ⇄ collection,
document ⇄ record.

## The concepts, mapped to what we built

| MongoDB concept | In this project |
|---|---|
| database | `taskmanager` (named in the URI path) |
| collection | `tasks` (Mongoose pluralizes the model name `Task`) |
| document | one task; our UUID stored as `_id` |
| `_id` | always indexed & unique → `findById` is O(log n), and duplicate ids throw `E11000` |
| query filter | `{ completed: false, priority: 'high' }` — runs where the data lives |
| replica set | Atlas M0 runs 3 nodes; `mongodb+srv://` discovers them via DNS SRV |
| write concern | `w=majority` — a write is acknowledged when 2 of 3 nodes have it |

## Decisions this project made (and the alternatives)

1. **UUID as `_id` (String)** — one identity, no duplicate id fields, free
   unique index; the single `_id ⇄ id` mapping lives in one `toTask()`
   function. Alternative: default `ObjectId` + separate `id` field (common,
   slightly more bookkeeping).
2. **Minimal Mongoose schema** — shape, enum, defaults; *business rules live
   in zod at the HTTP boundary* ([09-Validation.md](09-Validation.md)). One
   rulebook per concern. War story: `required: true` on a String **rejects
   empty strings** — it fought our `description: ""` contract default and
   lost. The contract outranks the storage layer's opinions.
3. **`.lean()` on every read** — plain objects instead of hydrated Documents
   (with `save()` and change tracking). The repository returns *data*;
   storage machinery must not leak across the layer boundary.
4. **Dates as ISO strings** — contract-identical storage, zero mapping.
   Trade-off: BSON `Date` would enable in-database range queries and date
   sorting; converting is a future migration *with a reason attached*.
5. **Filters pushed down, sorting kept in the service** — filtering is
   data-reduction (only matching documents cross the network). Our sort
   semantics, though, don't translate for free: priority order
   (low<medium<high) isn't alphabetical (needs a stored rank or an
   aggregation `$switch`) and "nulls last both directions" isn't BSON's
   ordering. In-memory sort of a few hundred rows is free; the repository
   comment is the work order for the day it isn't.

## The connection lifecycle

```
server.ts:  await connectToDatabase()   ← connect FIRST
            app.listen(port)            ← accept traffic only when servable
            (failure → console.error + process.exit(1): fail fast, let the
             platform restart us)
```

`/health` reports **readiness** since Phase 9: `database: connected |
disconnected`, HTTP 503 when degraded — the signal load balancers use to
route around a sick instance rather than bury it. Liveness = process up;
readiness = process *useful*.

`MONGODB_URI` is required config with **no default** — it carries
credentials, and a localhost fallback is a masked missing secret waiting for
production ([16-Environment-Variables.md](16-Environment-Variables.md)).

## Reading a connection string

```
mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/taskmanager?w=majority
└────┬─────┘ └────┬───────┘ └──────────┬───────────┘└────┬─────┘└───┬────┘
  SRV scheme   credential      DNS SRV name → cluster   database   options
  (DNS-based   (SECRET — .env   members discovered      (forget it and
  discovery)    only, rotate     automatically           you silently write
                if leaked)                               to `test`!)
```

## Common mistakes

1. Hydrated documents crossing the repository boundary — `.lean()` or leak.
2. `required: true` on legitimately-empty strings — the empty-string ambush.
3. Forgetting the database name in the URI — silent writes to `test`.
4. Listening before connecting / defaulting the URI — startup-window errors
   and masked secrets.
5. Duplicating business validation into Mongoose — two rulebooks drift;
   decide ownership per rule.
6. Fixed sleeps instead of readiness checks — in tests and deploys alike.
7. Treating Atlas network-allowlist as optional hardening — it's the outer
   defense layer, before auth even begins.

## Interview questions

1. **Document DB vs relational — when does Mongo fit?** JSON-shaped
   aggregates read/written as units, flexible shape evolution; relational
   wins for multi-entity transactions and rich joins.
2. **What is an ODM and its trade-off?** Mapping layer (models/schemas/
   hooks) over the driver: productivity and structure vs a second opinion
   layer that can fight your contract (see empty-string ambush).
3. **Why `.lean()`?** Skip Document hydration: cheaper, and plain data
   respects layer boundaries.
4. **What does `mongodb+srv` + `w=majority` tell you?** DNS-discovered
   replica set; majority-acknowledged (durable) writes.
5. **Where did your filters run before and after, and why does it matter?**
   App memory → database; only matching documents cross the network, and
   indexes can serve the filter — the difference between O(collection) I/O
   and O(result).
6. **Liveness vs readiness?** Up vs useful; readiness includes dependencies
   and speaks 503 so balancers reroute.

## Summary

MongoDB stores our tasks as documents in a 3-node Atlas replica set,
reached through a DNS-discovered, majority-acknowledged connection that the
server establishes before accepting traffic and that `/health` monitors as
readiness. Mongoose provides the model layer — kept deliberately thin so
zod remains the single rulebook — and the repository keeps its five-function
contract with one `_id ⇄ id` mapping and lean-only reads. Filters now run
where the data lives; sorting waits, with a documented reason, for the scale
that justifies it.

## Further reading

- MongoDB manual: CRUD + indexes — https://www.mongodb.com/docs/manual/
- Mongoose docs — https://mongoosejs.com/docs/
- BSON comparison/sort order — https://www.mongodb.com/docs/manual/reference/bson-type-comparison-order/
