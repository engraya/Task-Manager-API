// controllers/tasks.controller.ts — the HTTP layer for the tasks resource.
// A controller's job is translation: HTTP request in → typed input out,
// domain result in → status code + response body out. Nothing else.
//
// HONEST NOTE: right now this file also holds the data store and the
// business rules (defaults, merge semantics, filtering). That is Phase 5's
// extraction — the service layer. One refactor per phase.

import crypto from 'node:crypto';
import type { RequestHandler, Response } from 'express';
import {
  PRIORITIES,
  type CreateTaskInput,
  type Priority,
  type Task,
  type UpdateTaskInput,
} from '../types/task';
import type { ApiError, ApiErrorDetail } from '../types/api';

// ---------------------------------------------------------------------------
// TEMPORARY in-memory store (dies with the process; Phase 8 persists it).
// ---------------------------------------------------------------------------
const tasks: Task[] = [];

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Query values arrive as string | string[] | nested objects (qs parsing).
// Policy: take the first string if the key was repeated, undefined otherwise.
function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

function sendNotFound(res: Response): void {
  const body: ApiError = { error: { message: 'Task not found' } };
  res.status(404).json(body);
}

function sendValidationError(
  res: Response,
  details: ApiErrorDetail[],
  message = 'Validation failed',
): void {
  const body: ApiError = { error: { message, details } };
  res.status(422).json(body);
}

// ---------------------------------------------------------------------------
// GET /api/v1/tasks — list, with filters and sorting
// ---------------------------------------------------------------------------

const SORT_FIELDS = ['createdAt', 'dueDate', 'priority'] as const;
type SortField = (typeof SORT_FIELDS)[number];

const ORDERS = ['asc', 'desc'] as const;

// Sorting by priority needs an ordering the strings themselves don't have.
const PRIORITY_RANK: Record<Priority, number> = { low: 0, medium: 1, high: 2 };

export const listTasks: RequestHandler = (req, res) => {
  const details: ApiErrorDetail[] = [];

  const completedRaw = firstString(req.query.completed);
  let completedFilter: boolean | undefined;
  if (completedRaw !== undefined) {
    if (completedRaw === 'true' || completedRaw === 'false') {
      completedFilter = completedRaw === 'true';
    } else {
      details.push({ field: 'completed', message: "must be 'true' or 'false'" });
    }
  }

  const priorityRaw = firstString(req.query.priority);
  let priorityFilter: Priority | undefined;
  if (priorityRaw !== undefined) {
    if ((PRIORITIES as readonly string[]).includes(priorityRaw)) {
      priorityFilter = priorityRaw as Priority;
    } else {
      details.push({
        field: 'priority',
        message: `must be one of ${PRIORITIES.join(', ')}`,
      });
    }
  }

  const sortRaw = firstString(req.query.sort);
  let sortField: SortField = 'createdAt';
  if (sortRaw !== undefined) {
    if ((SORT_FIELDS as readonly string[]).includes(sortRaw)) {
      sortField = sortRaw as SortField;
    } else {
      details.push({
        field: 'sort',
        message: `must be one of ${SORT_FIELDS.join(', ')}`,
      });
    }
  }

  const orderRaw = firstString(req.query.order);
  let direction = -1; // desc: newest/highest first (contract default)
  if (orderRaw !== undefined) {
    if ((ORDERS as readonly string[]).includes(orderRaw)) {
      direction = orderRaw === 'asc' ? 1 : -1;
    } else {
      details.push({ field: 'order', message: "must be 'asc' or 'desc'" });
    }
  }

  if (details.length > 0) {
    sendValidationError(res, details, 'Invalid query parameters');
    return;
  }

  // filter() returns a NEW array, so the sort below never reorders the store.
  const result = tasks
    .filter(
      (t) =>
        (completedFilter === undefined || t.completed === completedFilter) &&
        (priorityFilter === undefined || t.priority === priorityFilter),
    )
    .sort((a, b) => {
      if (sortField === 'priority') {
        return direction * (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
      }
      if (sortField === 'dueDate') {
        // Tasks without a due date sort last regardless of direction.
        if (a.dueDate === null || b.dueDate === null) {
          if (a.dueDate === b.dueDate) return 0;
          return a.dueDate === null ? 1 : -1;
        }
        return direction * a.dueDate.localeCompare(b.dueDate);
      }
      // ISO 8601 strings sort correctly as plain strings.
      return direction * a.createdAt.localeCompare(b.createdAt);
    });

  res.status(200).json(result);
};

// ---------------------------------------------------------------------------
// POST /api/v1/tasks — create
// ---------------------------------------------------------------------------

export const createTask: RequestHandler = (req, res) => {
  const body: unknown = req.body;

  // Minimal guard until Phase 6 brings schema validation: without a title
  // we cannot construct a Task at all.
  if (
    !isRecord(body) ||
    typeof body.title !== 'string' ||
    body.title.trim() === ''
  ) {
    sendValidationError(res, [
      {
        field: 'title',
        message: 'title is required and must be a non-empty string',
      },
    ]);
    return;
  }

  // TODO(phase-6): the double cast below is a deliberate, visible lie — we
  // have only proven `title`; priority/dueDate/description are trusted
  // unchecked. Schema validation will replace trust with proof.
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
};

// ---------------------------------------------------------------------------
// GET /api/v1/tasks/:id — fetch one
// ---------------------------------------------------------------------------

export const getTask: RequestHandler = (req, res) => {
  const { id } = req.params;
  const task = tasks.find((t) => t.id === id);

  if (task === undefined) {
    sendNotFound(res);
    return;
  }

  res.status(200).json(task);
};

// ---------------------------------------------------------------------------
// PATCH /api/v1/tasks/:id — partial update
// ---------------------------------------------------------------------------

// The fields PATCH may touch — used to detect "empty" update requests.
const UPDATABLE_FIELDS = [
  'title',
  'description',
  'completed',
  'priority',
  'dueDate',
] as const;

// Absent field = don't touch; present field = set — including `null` for
// dueDate ("clear it") and `false` for completed. The merge checks
// `!== undefined` and NEVER uses `??`: ?? would treat an explicit null as
// "absent" and silently keep the old value.
export const updateTask: RequestHandler = (req, res) => {
  const { id } = req.params;
  const task = tasks.find((t) => t.id === id);

  if (task === undefined) {
    sendNotFound(res);
    return;
  }

  const body: unknown = req.body;

  if (
    !isRecord(body) ||
    !UPDATABLE_FIELDS.some((field) => body[field] !== undefined)
  ) {
    sendValidationError(res, [
      {
        field: 'body',
        message: `at least one of ${UPDATABLE_FIELDS.join(', ')} is required`,
      },
    ]);
    return;
  }

  if (
    body.title !== undefined &&
    (typeof body.title !== 'string' || body.title.trim() === '')
  ) {
    sendValidationError(res, [
      { field: 'title', message: 'title must be a non-empty string' },
    ]);
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
};

// ---------------------------------------------------------------------------
// DELETE /api/v1/tasks/:id — remove
// ---------------------------------------------------------------------------

// Idempotent by end state: repeating the delete leaves the same world
// (task absent), even though the second call answers 404.
export const deleteTask: RequestHandler = (req, res) => {
  const { id } = req.params;
  const index = tasks.findIndex((t) => t.id === id);

  if (index === -1) {
    sendNotFound(res);
    return;
  }

  tasks.splice(index, 1);
  res.status(204).end();
};
