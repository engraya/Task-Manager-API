// database/tasks.repository.ts — persistence for tasks: MongoDB (Phase 9).
//
// Same five-function contract the file version honored (Phase 8) — the
// service above this file did not change when its insides did. That is the
// repository seam doing its job, second time running.
//
// .lean() everywhere: we want plain data objects, not Mongoose Document
// instances — the repository returns contract-shaped Tasks, and hydrated
// documents (with save()/instance methods) would leak storage machinery
// upward.

import { TaskModel, type TaskDoc } from '../models/task.model';
import type { Priority, Task } from '../types/task';

// Filters run WHERE THE DATA LIVES: Mongo returns only matching documents
// instead of shipping the whole collection for the service to sift.
// (Sorting deliberately stays in the service — see the note on findAll.)
export interface TaskFilter {
  completed?: boolean;
  priority?: Priority;
}

// The one mapping in the codebase between storage identity and API
// identity: _id (storage) <-> id (contract).
function toTask(doc: TaskDoc): Task {
  return {
    id: doc._id,
    ownerId: doc.ownerId,
    title: doc.title,
    description: doc.description,
    completed: doc.completed,
    priority: doc.priority,
    dueDate: doc.dueDate,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// Note on sorting: it stays in the service, in memory, on purpose. Pushing
// OUR sort semantics into Mongo would need schema investment — priority
// order (low<medium<high) isn't alphabetical (needs a numeric rank field or
// an aggregation $switch), and "nulls last in both directions" for dueDate
// isn't BSON's ordering. At hundreds of tasks, in-memory sort is free;
// the day data outgrows that, this comment is the work order.
export async function findAll(filter: TaskFilter = {}): Promise<Task[]> {
  const query: Partial<Pick<TaskDoc, 'completed' | 'priority'>> = {};
  if (filter.completed !== undefined) query.completed = filter.completed;
  if (filter.priority !== undefined) query.priority = filter.priority;

  const docs = await TaskModel.find(query).lean<TaskDoc[]>();
  return docs.map(toTask);
}

export async function findById(id: string): Promise<Task | undefined> {
  const doc = await TaskModel.findById(id).lean<TaskDoc | null>();
  return doc === null ? undefined : toTask(doc);
}

export async function insert(task: Task): Promise<void> {
  const { id, ...rest } = task;
  await TaskModel.create({ _id: id, ...rest });
}

export async function update(updated: Task): Promise<void> {
  const { id, ...rest } = updated;
  await TaskModel.updateOne({ _id: id }, { $set: rest });
}

export async function remove(id: string): Promise<boolean> {
  const result = await TaskModel.deleteOne({ _id: id });
  return result.deletedCount > 0;
}
