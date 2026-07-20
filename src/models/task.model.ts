// models/task.model.ts — the STORAGE shape of a task document.
//
// Deliberately minimal: structure only. Business validation lives in zod at
// the HTTP boundary (docs/09-Validation.md); this schema is the document's
// shape plus defense-in-depth (enum, required) — not a second rulebook.
//
// Identity decision: we store our public UUID directly as MongoDB's _id
// (a string), instead of letting Mongo generate an ObjectId and keeping a
// second id field. One identity, zero duplication; the repository maps
// _id <-> id so the API contract doesn't change at all.

import { Schema, model } from 'mongoose';
import { PRIORITIES } from '../types/task';

export interface TaskDoc {
  _id: string; // our UUID
  ownerId: string; // User._id that owns this task
  title: string;
  description: string;
  completed: boolean;
  priority: (typeof PRIORITIES)[number];
  dueDate: string | null; // ISO 8601, canonical UTC (normalized by zod)
  createdAt: string;
  updatedAt: string;
}

const taskSchema = new Schema<TaskDoc>(
  {
    _id: { type: String, required: true },
    // index: true — EVERY authorization query in the next step filters by
    // ownerId ("your tasks only"). Without an index that filter is a full
    // collection scan; we add it alongside the field it serves.
    ownerId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    // NOT `required` — mongoose's required-on-String rejects '' (empty
    // string), but the contract says description defaults to "". The
    // contract wins; zod enforces the real rules at the boundary.
    description: { type: String, default: '' },
    completed: { type: Boolean, required: true, default: false },
    priority: { type: String, required: true, enum: PRIORITIES },
    dueDate: { type: String, default: null },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  {
    versionKey: false, // drop mongoose's __v bookkeeping field
  },
);

export const TaskModel = model<TaskDoc>('Task', taskSchema);
