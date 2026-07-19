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
import type { Task } from '../types/task';

// The one mapping in the codebase between storage identity and API
// identity: _id (storage) <-> id (contract).
function toTask(doc: TaskDoc): Task {
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    completed: doc.completed,
    priority: doc.priority,
    dueDate: doc.dueDate,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function findAll(): Promise<Task[]> {
  const docs = await TaskModel.find().lean<TaskDoc[]>();
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
