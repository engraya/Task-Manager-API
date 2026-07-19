// services/auth.service.ts — authentication business logic. HTTP-free.

import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import * as usersRepository from '../database/users.repository';
import { toPublicUser, type PublicUser, type User } from '../types/user';
import type { RegisterInput } from '../validators/auth.schemas';

// Cost factor 12: ~250ms of deliberate slowness per hash. Slow is the
// FEATURE — it caps an attacker's guesses-per-second if the hash database
// ever leaks. (Tune upward as hardware gets faster.)
const BCRYPT_COST = 12;

export async function registerUser(input: RegisterInput): Promise<PublicUser> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  const now = new Date().toISOString();

  const user: User = {
    id: crypto.randomUUID(),
    email: input.email,
    passwordHash,
    createdAt: now,
    updatedAt: now,
  };

  // No check-then-insert: the unique index is the authority on duplicate
  // emails (repository translates the collision to ConflictError).
  await usersRepository.insert(user);

  return toPublicUser(user);
}
