// services/tasks.service.ts — business logic and (for now) data access for
// the tasks resource.
//
// THE LAYER RULE: this file knows nothing about HTTP. No req, no res, no
// status codes, no envelopes. It takes typed input and returns domain
// results; "not found" is expressed as undefined/false, and the controller
// decides what that means on the wire.
//
// The in-memory array is still here TEMPORARILY — Phase 8 moves storage
// behind this layer, and nothing above it will notice.

import crypto from 'node:crypto';
import type {
  CreateTaskInput,
  Priority,
  Task,
  UpdateTaskInput,
} from '../types/task';

const tasks: Task[] = [];

export const SORT_FIELDS = ['createdAt', 'dueDate', 'priority'] as const;
export type SortField = (typeof SORT_FIELDS)[number];

// Sorting by priority needs an ordering the strings themselves don't have.
const PRIORITY_RANK: Record<Priority, number> = { low: 0, medium: 1, high: 2 };

export interface ListTasksOptions {
  completed?: boolean;
  priority?: Priority;
  sortField?: SortField; // default: createdAt
  direction?: 1 | -1; // default: -1 (desc — newest/highest first)
}

export function listTasks(options: ListTasksOptions = {}): Task[] {
  const { completed, priority, sortField = 'createdAt', direction = -1 } = options;

  // filter() returns a NEW array, so the sort below never reorders the store.
  return tasks
    .filter(
      (t) =>
        (completed === undefined || t.completed === completed) &&
        (priority === undefined || t.priority === priority),
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
}

export function createTask(input: CreateTaskInput): Task {
  const now = new Date().toISOString();

  const task: Task = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    description: input.description ?? '',
    completed: false, // invariant: a new task is never born completed
    priority: input.priority ?? 'medium',
    dueDate: input.dueDate ?? null,
    createdAt: now,
    updatedAt: now,
  };

  tasks.push(task);
  return task;
}

export function getTaskById(id: string): Task | undefined {
  return tasks.find((t) => t.id === id);
}

// Merge semantics: absent field = don't touch; present field = set —
// including null for dueDate ("clear it") and false for completed. Checks
// are `!== undefined`, never `??` (?? would swallow an explicit null).
export function updateTask(id: string, input: UpdateTaskInput): Task | undefined {
  const task = tasks.find((t) => t.id === id);
  if (task === undefined) {
    return undefined;
  }

  if (input.title !== undefined) task.title = input.title.trim();
  if (input.description !== undefined) task.description = input.description;
  if (input.completed !== undefined) task.completed = input.completed;
  if (input.priority !== undefined) task.priority = input.priority;
  if (input.dueDate !== undefined) task.dueDate = input.dueDate; // null clears
  task.updatedAt = new Date().toISOString();

  return task;
}

export function deleteTask(id: string): boolean {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) {
    return false;
  }
  tasks.splice(index, 1);
  return true;
}
