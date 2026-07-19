// controllers/tasks.controller.ts — the HTTP layer for the tasks resource.
// Each handler follows the same shape: EXTRACT typed values from the
// request → DELEGATE to the service → RESPOND with a status and body.
// Business rules and data live one layer down, in ../services/tasks.service.

import type { RequestHandler, Response } from 'express';
import * as tasksService from '../services/tasks.service';
import { SORT_FIELDS, type SortField } from '../services/tasks.service';
import {
  createTaskSchema,
  updateTaskSchema,
  zodIssuesToDetails,
} from '../validators/task.schemas';
import { PRIORITIES, type Priority } from '../types/task';
import type { ApiError, ApiErrorDetail } from '../types/api';

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

const ORDERS = ['asc', 'desc'] as const;

export const listTasks: RequestHandler = (req, res) => {
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
    sendValidationError(res, details, 'Invalid query parameters');
    return;
  }

  const result = tasksService.listTasks({ completed, priority, sortField, direction });
  res.status(200).json(result);
};

// ---------------------------------------------------------------------------
// POST /api/v1/tasks — create
// ---------------------------------------------------------------------------

export const createTask: RequestHandler = (req, res) => {
  const result = createTaskSchema.safeParse(req.body);

  if (!result.success) {
    sendValidationError(res, zodIssuesToDetails(result.error));
    return;
  }

  // result.data is a PROVEN CreateTaskInput — inferred from the schema.
  const task = tasksService.createTask(result.data);
  res.status(201).location(`/api/v1/tasks/${task.id}`).json(task);
};

// ---------------------------------------------------------------------------
// GET /api/v1/tasks/:id — fetch one
// ---------------------------------------------------------------------------

export const getTask: RequestHandler = (req, res) => {
  const task = tasksService.getTaskById(firstString(req.params.id) ?? '');

  if (task === undefined) {
    sendNotFound(res);
    return;
  }

  res.status(200).json(task);
};

// ---------------------------------------------------------------------------
// PATCH /api/v1/tasks/:id — partial update
// ---------------------------------------------------------------------------

export const updateTask: RequestHandler = (req, res) => {
  const result = updateTaskSchema.safeParse(req.body);

  if (!result.success) {
    sendValidationError(res, zodIssuesToDetails(result.error));
    return;
  }

  // result.data is a PROVEN UpdateTaskInput — the last cast-lie is gone.
  const task = tasksService.updateTask(firstString(req.params.id) ?? '', result.data);

  if (task === undefined) {
    sendNotFound(res);
    return;
  }

  res.status(200).json(task);
};

// ---------------------------------------------------------------------------
// DELETE /api/v1/tasks/:id — remove
// ---------------------------------------------------------------------------

export const deleteTask: RequestHandler = (req, res) => {
  const deleted = tasksService.deleteTask(firstString(req.params.id) ?? '');

  if (!deleted) {
    sendNotFound(res);
    return;
  }

  res.status(204).end();
};
