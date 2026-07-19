// models/user.model.ts — storage shape for users.
// Same conventions as task.model.ts: UUID as _id, minimal schema, ISO
// string dates, business rules at the zod boundary.

import { Schema, model } from 'mongoose';

export interface UserDoc {
  _id: string; // our UUID
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

const userSchema = new Schema<UserDoc>(
  {
    _id: { type: String, required: true },
    // unique: true creates a UNIQUE INDEX — the database-level authority on
    // "no two users share an email". The check-then-insert pattern in
    // application code has a race window; the index does not.
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  {
    versionKey: false,
  },
);

export const UserModel = model<UserDoc>('User', userSchema);
