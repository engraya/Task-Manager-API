# Task Manager API — Contract (v1)

> **The source of truth for what this API promises.** Written before
> implementation (contract-first, see [03-REST.md](03-REST.md)); Phases 3–7
> implement it; changes to this document are API changes and get their own
> commits. Auth (Phases 10–11) will extend it.

Base path: **`/api/v1`** · All bodies: `application/json` · All times: ISO 8601 UTC

---

## The Task resource

```ts
interface Task {
  id: string;                            // UUID, server-generated, immutable
  title: string;                        // 1–200 chars
  description: string;                  // 0–2000 chars, default ""
  completed: boolean;                   // default false
  priority: 'low' | 'medium' | 'high';  // default 'medium'
  dueDate: string | null;               // ISO 8601 datetime, or null = none
  createdAt: string;                    // ISO 8601, server-set, immutable
  updatedAt: string;                    // ISO 8601, server-maintained
}
```

Design decisions (the *why* behind each field):

- **`id: string` (UUID)** rather than an incrementing number: no information
  leak (sequential ids reveal volume and invite enumeration), no collision
  coordination needed later when a database generates them. Node provides
  `crypto.randomUUID()` natively.
- **Dates are ISO 8601 strings** (`"2026-07-18T09:30:00.000Z"`): JSON has no
  date type — the string boundary rule again. ISO 8601 sorts lexicographically,
  parses everywhere (`new Date(s)`), and carries timezone (always UTC on the
  wire; display timezones are a client concern).
- **`dueDate: string | null`** — explicit null, not an absent field: "no due
  date" is a *value*, and optional-vs-null ambiguity breeds client bugs.
- **`priority` is a closed enum** — validated server-side (Phase 6); the
  string union is the same one-source-of-truth pattern as `NodeEnv` in config.
- **`createdAt`/`updatedAt` are server-set** — clients never send them;
  timestamps from untrusted clocks are meaningless.

### Client input shapes (what requests may contain)

```ts
interface CreateTaskInput {
  title: string;                         // required
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string | null;
}

interface UpdateTaskInput {              // PATCH: all optional, ≥1 required
  title?: string;
  description?: string;
  completed?: boolean;
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string | null;
}
```

Note what's *absent*: `id`, `createdAt`, `updatedAt` are not accepted from
clients; `completed` is not accepted at creation (a new task is by definition
not done). Unknown fields are rejected (Phase 6) — silently dropping them
hides client bugs.

---

## Error shape (uniform across every endpoint)

```ts
interface ApiError {
  error: {
    message: string;                     // human-readable summary
    details?: Array<{                    // present on validation failures
      field: string;                     // e.g. "title"
      message: string;                   // e.g. "must be 1-200 characters"
    }>;
  };
}
```

Status code policy (the blame line, [02-HTTP.md](02-HTTP.md)):

| Code | Used when |
|---|---|
| 400 | request unparseable (malformed JSON, wrong content type) |
| 404 | no task with that id / no such route |
| 422 | JSON fine, content invalid (missing title, bad priority, bad date…) — with `details` |
| 500 | our bug; body never leaks internals (Phase 7) |

---

## Endpoints

### 1 · List tasks — `GET /api/v1/tasks`

- **Query (Phase 3+):** `completed=true|false` · `priority=low|medium|high` ·
  `sort=createdAt|dueDate|priority` (default `createdAt`) · `order=asc|desc`
  (default `desc`)
- **200** → `Task[]` (empty array if none — never 404 for an empty collection:
  the collection exists, it's just empty)
- Safe ✅ Idempotent ✅

### 2 · Get one task — `GET /api/v1/tasks/:id`

- **200** → `Task` · **404** → `ApiError` (unknown id)
- Safe ✅ Idempotent ✅

### 3 · Create task — `POST /api/v1/tasks`

- **Body:** `CreateTaskInput`
- **201** → the complete created `Task` (client immediately learns the
  server-generated `id` and timestamps) + `Location: /api/v1/tasks/<id>` header
- **400 / 422** → `ApiError`
- Safe ❌ Idempotent ❌ — retries create duplicates; clients must not blind-retry

### 4 · Update task — `PATCH /api/v1/tasks/:id`

- **Body:** `UpdateTaskInput` (at least one field; unknown fields rejected)
- **200** → the complete updated `Task` (`updatedAt` refreshed)
- **404 / 400 / 422** → `ApiError`
- Safe ❌ Idempotent ✅ (set-field semantics: repeating the same patch is a no-op)

### 5 · Delete task — `DELETE /api/v1/tasks/:id`

- **204** → empty body (nothing useful to say; 204 promises emptiness)
- **404** → `ApiError` (unknown id)
- Safe ❌ Idempotent ✅ — the end state "task absent" is stable across retries
  (the *first* delete says 204, a retry says 404; state, not status, is what's
  idempotent)

### 0 · Health — `GET /health` (implemented Phase 2)

- Outside `/api/v1` — it describes the *process*, not the domain, and
  monitoring URLs shouldn't churn with API versions.
- **200** → `{ status: 'ok', uptime: number, environment: string }`

---

## Worked examples

```
POST /api/v1/tasks
Content-Type: application/json

{"title": "Ship phase 3", "priority": "high", "dueDate": "2026-07-25T17:00:00Z"}

HTTP/1.1 201 Created
Location: /api/v1/tasks/9f1c8e2a-…
{
  "id": "9f1c8e2a-…", "title": "Ship phase 3", "description": "",
  "completed": false, "priority": "high",
  "dueDate": "2026-07-25T17:00:00.000Z",
  "createdAt": "2026-07-18T14:02:11.512Z", "updatedAt": "2026-07-18T14:02:11.512Z"
}
```

```
POST /api/v1/tasks
{"description": "no title"}

HTTP/1.1 422 Unprocessable Entity
{"error": {"message": "Validation failed",
  "details": [{"field": "title", "message": "title is required"}]}}
```

```
DELETE /api/v1/tasks/9f1c8e2a-…      → 204 (empty)
DELETE /api/v1/tasks/9f1c8e2a-…      → 404 {"error":{"message":"Task not found"}}
```

---

## Implementation map

| Contract element | Phase |
|---|---|
| Routes + in-memory happy paths | 3 |
| Controller/service layering | 4–5 |
| Validation (422 + details) | 6 |
| Error shape everywhere, 500 policy | 7 |
| Persistence (file → MongoDB) | 8–9 |
| Auth: 401/403, per-user tasks | 10–11 |
