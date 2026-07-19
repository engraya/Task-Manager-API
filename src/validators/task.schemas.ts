// validators/task.schemas.ts — zod schemas for the tasks resource.
//
// THE INVERSION: these schemas are now the single source of truth for the
// input shapes. CreateTaskInput / UpdateTaskInput are INFERRED from them
// (z.infer) instead of being hand-written interfaces — the type and the
// runtime check can never drift apart, because they are the same artifact.
//
// Everything Step 6.1 did in ~100 manual lines is expressed here
// declaratively: shape check, unknown-field rejection (strictObject),
// type + bounds checks, closed sets (enum), parse-and-normalize
// (transform), and error aggregation (zod collects all issues).

import { z } from 'zod';
import { PRIORITIES } from '../types/task';

// ISO 8601 datetime (offset allowed), NORMALIZED to canonical UTC —
// downstream code and storage see exactly one representation.
const isoDatetime = z.iso
  .datetime({ offset: true, message: 'must be an ISO 8601 datetime string' })
  .transform((value) => new Date(value).toISOString());

export const createTaskSchema = z.strictObject({
  title: z
    .string({ message: 'title is required and must be a string' })
    .trim()
    .min(1, { message: 'title must be 1-200 characters' })
    .max(200, { message: 'title must be 1-200 characters' }),
  description: z
    .string()
    .max(2000, { message: 'description must be at most 2000 characters' })
    .optional(),
  priority: z
    .enum(PRIORITIES, {
      message: `priority must be one of ${PRIORITIES.join(', ')}`,
    })
    .optional(),
  dueDate: isoDatetime.nullable().optional(),
});
// Note: strictObject rejects unknown keys — including `completed`, which the
// contract forbids at creation (a new task is never born completed).

export const updateTaskSchema = z
  .strictObject({
    title: z
      .string()
      .trim()
      .min(1, { message: 'title must be 1-200 characters' })
      .max(200, { message: 'title must be 1-200 characters' })
      .optional(),
    description: z
      .string()
      .max(2000, { message: 'description must be at most 2000 characters' })
      .optional(),
    completed: z
      .boolean({ message: 'completed must be a boolean' })
      .optional(),
    priority: z
      .enum(PRIORITIES, {
        message: `priority must be one of ${PRIORITIES.join(', ')}`,
      })
      .optional(),
    dueDate: isoDatetime.nullable().optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message:
      'at least one of title, description, completed, priority, dueDate is required',
  });

// The types come FROM the schemas — one source of truth for check and type.
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
