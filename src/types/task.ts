// types/task.ts — the Task domain model, exactly as declared in
// docs/API-Contract.md. This file is the single source of truth for these
// shapes; every layer imports from here.

// Runtime array + derived union type (same pattern as NODE_ENVS in config):
// one source of truth serves the compiler now and validation in Phase 6.
export const PRIORITIES = ['low', 'medium', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface Task {
  id: string; // UUID, server-generated, immutable
  title: string; // 1–200 chars
  description: string; // 0–2000 chars, default ""
  completed: boolean; // default false
  priority: Priority; // default 'medium'
  dueDate: string | null; // ISO 8601 datetime, or null = none
  createdAt: string; // ISO 8601, server-set, immutable
  updatedAt: string; // ISO 8601, server-maintained
}

// What clients MAY send — never id/timestamps, and no `completed` at
// creation (a new task is by definition not done).
export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: Priority;
  dueDate?: string | null;
}

// PATCH input: everything optional, at least one field required (enforced
// by validation in Phase 6).
export interface UpdateTaskInput {
  title?: string;
  description?: string;
  completed?: boolean;
  priority?: Priority;
  dueDate?: string | null;
}
