// validators/create-task.manual.ts — Step 6.1: full validation BY HAND for
// one endpoint, so every job a schema library automates is visible first.
// Step 6.2 replaces this with a zod schema; this file then lives on only in
// git history as the "before" photo.
//
// The pattern is "parse, don't validate": we don't answer "is this valid?"
// (boolean) — we CONVERT unknown into CreateTaskInput, or fail with details.
// Output being typed is the point; a boolean would let the cast-lie survive.

import { PRIORITIES, type CreateTaskInput, type Priority } from '../types/task';
import type { ApiErrorDetail } from '../types/api';

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; details: ApiErrorDetail[] };

// Contract: unknown fields are rejected, not silently dropped — a client
// sending `titel` deserves an error, not a mystery.
const ALLOWED_FIELDS = ['title', 'description', 'priority', 'dueDate'] as const;

export function validateCreateTaskInput(
  body: unknown,
): ValidationResult<CreateTaskInput> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return {
      ok: false,
      details: [{ field: 'body', message: 'request body must be a JSON object' }],
    };
  }
  const record = body as Record<string, unknown>;
  const details: ApiErrorDetail[] = [];

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_FIELDS as readonly string[]).includes(key)) {
      details.push({
        field: key,
        message:
          key === 'completed'
            ? 'completed cannot be set at creation'
            : 'unknown field',
      });
    }
  }

  // title — required, string, 1–200 chars after trimming
  let title: string | undefined;
  if (typeof record.title !== 'string') {
    details.push({
      field: 'title',
      message: 'title is required and must be a string',
    });
  } else {
    title = record.title.trim();
    if (title.length < 1 || title.length > 200) {
      details.push({ field: 'title', message: 'title must be 1-200 characters' });
      title = undefined;
    }
  }

  // description — optional, string, ≤ 2000 chars
  let description: string | undefined;
  if (record.description !== undefined) {
    if (typeof record.description !== 'string') {
      details.push({ field: 'description', message: 'description must be a string' });
    } else if (record.description.length > 2000) {
      details.push({
        field: 'description',
        message: 'description must be at most 2000 characters',
      });
    } else {
      description = record.description;
    }
  }

  // priority — optional, member of the closed set
  let priority: Priority | undefined;
  if (record.priority !== undefined) {
    if (
      typeof record.priority === 'string' &&
      (PRIORITIES as readonly string[]).includes(record.priority)
    ) {
      priority = record.priority as Priority;
    } else {
      details.push({
        field: 'priority',
        message: `priority must be one of ${PRIORITIES.join(', ')}`,
      });
    }
  }

  // dueDate — optional; null ("no due date") or a parseable ISO datetime,
  // NORMALIZED to canonical UTC form (validators may transform).
  let dueDate: string | null | undefined;
  if (record.dueDate !== undefined) {
    if (record.dueDate === null) {
      dueDate = null;
    } else if (
      typeof record.dueDate === 'string' &&
      !Number.isNaN(Date.parse(record.dueDate))
    ) {
      dueDate = new Date(record.dueDate).toISOString();
    } else {
      details.push({
        field: 'dueDate',
        message: 'dueDate must be an ISO 8601 datetime string or null',
      });
    }
  }

  if (details.length > 0 || title === undefined) {
    return { ok: false, details };
  }

  return { ok: true, value: { title, description, priority, dueDate } };
}
