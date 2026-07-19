// database/users.repository.ts — persistence for users.

import { ConflictError } from '../errors/app-error';
import { UserModel, type UserDoc } from '../models/user.model';
import type { User } from '../types/user';

function toUser(doc: UserDoc): User {
  return {
    id: doc._id,
    email: doc.email,
    passwordHash: doc.passwordHash,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function findByEmail(email: string): Promise<User | undefined> {
  const doc = await UserModel.findOne({ email }).lean<UserDoc | null>();
  return doc === null ? undefined : toUser(doc);
}

export async function findById(id: string): Promise<User | undefined> {
  const doc = await UserModel.findById(id).lean<UserDoc | null>();
  return doc === null ? undefined : toUser(doc);
}

// Insert relies on the unique email index as the authority: a concurrent
// duplicate registration loses the race INSIDE the database and surfaces
// as error code 11000, which we translate to the domain's ConflictError
// (anti-corruption: Mongo's error format stays in this file).
export async function insert(user: User): Promise<void> {
  const { id, ...rest } = user;
  try {
    await UserModel.create({ _id: id, ...rest });
  } catch (err) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: unknown }).code === 11000
    ) {
      throw new ConflictError('Email is already registered');
    }
    throw err;
  }
}
