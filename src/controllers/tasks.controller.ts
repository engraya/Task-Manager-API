// controllers/tasks.controller.ts — the HTTP layer for the tasks resource.
// Each handler follows the same shape: EXTRACT typed values from the
// request → DELEGATE to the service → RESPOND with a status and body.
// Business rules and data live one layer down, in ../services/tasks.service.

import type { Request, RequestHandler } from 'express';
import * as tasksService from '../services/tasks.service';
import { SORT_FIELDS, type SortField } from '../services/tasks.service';
import { NotFoundError, ValidationError } from '../errors/app-error';
import {
  PRIORITIES,
  type CreateTaskInput,
  type Priority,
  type UpdateTaskInput,
} from '../types/task';
import type { ApiErrorDetail } from '../types/api';

// ---------------------------------------------------------------------------
// Shared helpers (HTTP-side)
// ---------------------------------------------------------------------------

// Query values arrive as string | string[] | nested objects (qs parsing).
// Policy: take the first string if the key was repeated, undefined otherwise.
function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

// req.userId is typed `string | undefined` (optional — see types/express.d.ts)
// because the field exists globally on Request but is only SET behind
// requireAuth. Every handler here runs behind that gate, so undefined means a
// wiring bug (gate missing from the chain), NOT a client fault — hence a plain
// Error → 500 (a PROGRAMMER error, docs/10), not a 401. This function is the
// one place the optional type gets narrowed to the string the rest can trust.
function requireUserId(req: Request): string {
  const { userId } = req;
  if (userId === undefined) {
    throw new Error('requireUserId: no req.userId — requireAuth must run first');
  }
  return userId;
}

// ---------------------------------------------------------------------------
// GET /api/v1/tasks — list, with filters and sorting
// ---------------------------------------------------------------------------

const ORDERS = ['asc', 'desc'] as const;

export const listTasks: RequestHandler = async (req, res) => {
  const details: ApiErrorDetail[] = [];

  const completedRaw = firstString(req.query.completed);
  let completed: boolean | undefined;
  if (completedRaw !== undefined) {
    if (completedRaw === 'true' || completedRaw === 'false') {
      completed = completedRaw === 'true';
    } else {
      details.push({ field: 'completed', message: "must be 'true' or 'false'" });
    }
  }

  const priorityRaw = firstString(req.query.priority);
  let priority: Priority | undefined;
  if (priorityRaw !== undefined) {
    if ((PRIORITIES as readonly string[]).includes(priorityRaw)) {
      priority = priorityRaw as Priority;
    } else {
      details.push({
        field: 'priority',
        message: `must be one of ${PRIORITIES.join(', ')}`,
      });
    }
  }

  const sortRaw = firstString(req.query.sort);
  let sortField: SortField | undefined;
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
  let direction: 1 | -1 | undefined;
  if (orderRaw !== undefined) {
    if ((ORDERS as readonly string[]).includes(orderRaw)) {
      direction = orderRaw === 'asc' ? 1 : -1;
    } else {
      details.push({ field: 'order', message: "must be 'asc' or 'desc'" });
    }
  }

  if (details.length > 0) {
    throw new ValidationError(details, 'Invalid query parameters');
  }

  const result = await tasksService.listTasks(requireUserId(req), {
    completed,
    priority,
    sortField,
    direction,
  });
  res.status(200).json(result);
};

// ---------------------------------------------------------------------------
// POST /api/v1/tasks — create
// ---------------------------------------------------------------------------

export const createTask: RequestHandler = async (req, res) => {
  // Guaranteed by validateBody(createTaskSchema) in the route chain — the
  // controller only ever runs with a parsed, transformed body. This
  // assertion documents that trust relationship (see routes file).
  const input = req.body as CreateTaskInput;

  // The owner is the authenticated caller — assigned server-side, never taken
  // from the body. The task is born belonging to whoever holds the token.
  const task = await tasksService.createTask(input, requireUserId(req));
  res.status(201).location(`/api/v1/tasks/${task.id}`).json(task);
};

// ---------------------------------------------------------------------------
// GET /api/v1/tasks/:id — fetch one
// ---------------------------------------------------------------------------

export const getTask: RequestHandler = async (req, res) => {
  const task = await tasksService.getTaskById(
    firstString(req.params.id) ?? '',
    requireUserId(req),
  );

  // Not yours is reported as not found — see the 404-not-403 note in getTask's
  // service/repository layers and docs/29-Authorization.md.
  if (task === undefined) {
    throw new NotFoundError('Task not found');
  }

  res.status(200).json(task);
};

// ---------------------------------------------------------------------------
// PATCH /api/v1/tasks/:id — partial update
// ---------------------------------------------------------------------------

export const updateTask: RequestHandler = async (req, res) => {
  // Guaranteed by validateBody(updateTaskSchema) in the route chain.
  const input = req.body as UpdateTaskInput;

  const task = await tasksService.updateTask(
    firstString(req.params.id) ?? '',
    input,
    requireUserId(req),
  );

  if (task === undefined) {
    throw new NotFoundError('Task not found');
  }

  res.status(200).json(task);
};

// ---------------------------------------------------------------------------
// DELETE /api/v1/tasks/:id — remove
// ---------------------------------------------------------------------------

export const deleteTask: RequestHandler = async (req, res) => {
  const deleted = await tasksService.deleteTask(
    firstString(req.params.id) ?? '',
    requireUserId(req),
  );

  if (!deleted) {
    throw new NotFoundError('Task not found');
  }

  res.status(204).end();
};
