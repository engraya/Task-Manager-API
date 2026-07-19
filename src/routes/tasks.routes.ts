// routes/tasks.routes.ts — everything under /api/v1/tasks.
// The router only knows RELATIVE paths ('/'); the mount point is app.ts's
// decision. This router currently also holds the data and the handler
// logic — deliberately. Phases 4–5 will extract controllers and services
// when the pressure to do so becomes visible.

import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { CreateTaskInput, Task } from '../types/task';
import type { ApiError } from '../types/api';

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

export default tasksRouter;
