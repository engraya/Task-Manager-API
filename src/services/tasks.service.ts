// services/tasks.service.ts — business logic for the tasks resource.
// HTTP-free as ever. As of Phase 8, storage lives one layer DOWN behind
// ../database/tasks.repository — this service orchestrates rules; the
// repository persists. I/O at the bottom means everything here is async:
// promises propagate from the repository upward.

import crypto from 'node:crypto';
import * as tasksRepository from '../database/tasks.repository';
import type {
  CreateTaskInput,
  Priority,
  Task,
  UpdateTaskInput,
} from '../types/task';

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

export async function listTasks(options: ListTasksOptions = {}): Promise<Task[]> {
  const { completed, priority, sortField = 'createdAt', direction = -1 } = options;

  // Filtering happens in the database (only matching docs cross the wire);
  // ordering policy stays here (see the repository's note on sorting).
  const matching = await tasksRepository.findAll({ completed, priority });

  return matching.sort((a, b) => {
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

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const now = new Date().toISOString();

  const task: Task = {
    id: crypto.randomUUID(),
    title: input.title,
    description: input.description ?? '',
    completed: false, // invariant: a new task is never born completed
    priority: input.priority ?? 'medium',
    dueDate: input.dueDate ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await tasksRepository.insert(task);
  return task;
}

export async function getTaskById(id: string): Promise<Task | undefined> {
  return tasksRepository.findById(id);
}

// Merge semantics: absent field = don't touch; present field = set —
// including null for dueDate ("clear it") and false for completed. Checks
// are `!== undefined`, never `??` (?? would swallow an explicit null).
// Note we build a NEW object and hand it to the repository — no shared
// mutable references between layers.
export async function updateTask(
  id: string,
  input: UpdateTaskInput,
): Promise<Task | undefined> {
  const existing = await tasksRepository.findById(id);
  if (existing === undefined) {
    return undefined;
  }

  const updated: Task = { ...existing };
  if (input.title !== undefined) updated.title = input.title;
  if (input.description !== undefined) updated.description = input.description;
  if (input.completed !== undefined) updated.completed = input.completed;
  if (input.priority !== undefined) updated.priority = input.priority;
  if (input.dueDate !== undefined) updated.dueDate = input.dueDate; // null clears
  updated.updatedAt = new Date().toISOString();

  await tasksRepository.update(updated);
  return updated;
}

export async function deleteTask(id: string): Promise<boolean> {
  return tasksRepository.remove(id);
}
