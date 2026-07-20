// types/task.ts — the Task domain model, exactly as declared in
// docs/API-Contract.md. This file is the single source of truth for these
// shapes; every layer imports from here.

// Runtime array + derived union type (same pattern as NODE_ENVS in config):
// one source of truth serves the compiler now and validation in Phase 6.
export const PRIORITIES = ['low', 'medium', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface Task {
  id: string; // UUID, server-generated, immutable
  ownerId: string; // the User.id that owns this task; server-set from the token
  title: string; // 1–200 chars
  description: string; // 0–2000 chars, default ""
  completed: boolean; // default false
  priority: Priority; // default 'medium'
  dueDate: string | null; // ISO 8601 datetime, or null = none
  createdAt: string; // ISO 8601, server-set, immutable
  updatedAt: string; // ISO 8601, server-maintained
}

// What clients may send is now DEFINED BY the zod schemas (Phase 6) and
// inferred from them — re-exported here so `types/` stays the one address
// for shapes. This is a type-only re-export: it is fully erased at compile
// time, so no runtime import cycle exists (validators import PRIORITIES
// from this file at runtime; this edge is types-only in the other
// direction).
export type { CreateTaskInput, UpdateTaskInput } from '../validators/task.schemas';
