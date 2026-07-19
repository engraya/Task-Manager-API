// routes/tasks.routes.ts — everything under /api/v1/tasks.
// The router only knows RELATIVE paths ('/'); the mount point is app.ts's
// decision. This router currently also holds the data and the handler
// logic — deliberately. Phases 4–5 will extract controllers and services
// when the pressure to do so becomes visible.

import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { CreateTaskInput, Task, UpdateTaskInput } from '../types/task';
import type { ApiError } from '../types/api';

// The fields PATCH may touch — used to detect "empty" update requests.
const UPDATABLE_FIELDS = [
  'title',
  'description',
  'completed',
  'priority',
  'dueDate',
] as const;

// Narrowing helper: "is this a plain object I can safely index into?"
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// TEMPORARY in-memory store. Lives in process memory, so it dies on every
// restart (and tsx restarts on every save!) — see docs/13-Response-Lifecycle
// on process lifetime. Phase 8 gives tasks a real home.
const tasks: Task[] = [];

const tasksRouter = Router();

// GET /api/v1/tasks — list tasks.
// Contract: 200 with Task[]; an empty collection is 200 + [], never 404.
tasksRouter.get('/', (_req: Request, res: Response) => {
  res.status(200).json(tasks);
});

// POST /api/v1/tasks — create a task.
// Contract: 201 + complete Task + Location header; 422 on invalid input.
tasksRouter.post('/', (req: Request, res: Response) => {
  const body: unknown = req.body;

  // Minimal guard until Phase 6 brings schema validation: without a title
  // we cannot construct a Task at all.
  if (
    !isRecord(body) ||
    typeof body.title !== 'string' ||
    body.title.trim() === ''
  ) {
    const error: ApiError = {
      error: {
        message: 'Validation failed',
        details: [
          {
            field: 'title',
            message: 'title is required and must be a non-empty string',
          },
        ],
      },
    };
    res.status(422).json(error);
    return;
  }

  // TODO(phase-6): the double cast below is a deliberate, visible lie — we
  // have only proven `title`; priority/dueDate/description are trusted
  // unchecked. tsc rejects a direct cast (types don't overlap enough), and
  // it's right. Schema validation will replace trust with proof.
  const input = body as unknown as CreateTaskInput;
  const now = new Date().toISOString();

  const task: Task = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    description: input.description ?? '',
    completed: false, // contract: never client-set at creation
    priority: input.priority ?? 'medium',
    dueDate: input.dueDate ?? null,
    createdAt: now,
    updatedAt: now,
  };

  tasks.push(task);

  res.status(201).location(`/api/v1/tasks/${task.id}`).json(task);
});

// GET /api/v1/tasks/:id — fetch one task.
// Contract: 200 + Task, or 404 envelope for an unknown id.
tasksRouter.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const task = tasks.find((t) => t.id === id);

  if (task === undefined) {
    const error: ApiError = { error: { message: 'Task not found' } };
    res.status(404).json(error);
    return;
  }

  res.status(200).json(task);
});

// PATCH /api/v1/tasks/:id — partially update a task.
// Contract: 200 + complete updated Task; 404 unknown id; 422 empty/invalid.
// The core semantic: absent field = don't touch; present field = set —
// including `null` for dueDate ("clear it") and `false` for completed.
// This is why the merge below checks `!== undefined` and NEVER uses `??`:
// ?? would treat an explicit null as "absent" and silently keep the old value.
tasksRouter.patch('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const task = tasks.find((t) => t.id === id);

  if (task === undefined) {
    const error: ApiError = { error: { message: 'Task not found' } };
    res.status(404).json(error);
    return;
  }

  const body: unknown = req.body;

  if (
    !isRecord(body) ||
    !UPDATABLE_FIELDS.some((field) => body[field] !== undefined)
  ) {
    const error: ApiError = {
      error: {
        message: 'Validation failed',
        details: [
          {
            field: 'body',
            message: `at least one of ${UPDATABLE_FIELDS.join(', ')} is required`,
          },
        ],
      },
    };
    res.status(422).json(error);
    return;
  }

  if (
    body.title !== undefined &&
    (typeof body.title !== 'string' || body.title.trim() === '')
  ) {
    const error: ApiError = {
      error: {
        message: 'Validation failed',
        details: [{ field: 'title', message: 'title must be a non-empty string' }],
      },
    };
    res.status(422).json(error);
    return;
  }

  // TODO(phase-6): same visible lie as in POST — only title is proven;
  // priority/dueDate/completed/description are trusted unchecked, and
  // unknown fields are silently ignored instead of rejected.
  const input = body as unknown as UpdateTaskInput;

  if (input.title !== undefined) task.title = input.title.trim();
  if (input.description !== undefined) task.description = input.description;
  if (input.completed !== undefined) task.completed = input.completed;
  if (input.priority !== undefined) task.priority = input.priority;
  if (input.dueDate !== undefined) task.dueDate = input.dueDate; // null clears
  task.updatedAt = new Date().toISOString();

  res.status(200).json(task);
});

// DELETE /api/v1/tasks/:id — remove a task.
// Contract: 204 with empty body, or 404 for an unknown id. Idempotent by
// end state: repeating the delete leaves the same world (task absent).
tasksRouter.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const index = tasks.findIndex((t) => t.id === id);

  if (index === -1) {
    const error: ApiError = { error: { message: 'Task not found' } };
    res.status(404).json(error);
    return;
  }

  tasks.splice(index, 1);
  res.status(204).end();
});

export default tasksRouter;
