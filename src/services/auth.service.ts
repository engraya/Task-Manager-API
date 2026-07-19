// services/auth.service.ts — authentication business logic. HTTP-free.

import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import * as usersRepository from '../database/users.repository';
import { UnauthorizedError } from '../errors/app-error';
import { toPublicUser, type PublicUser, type User } from '../types/user';
import type { LoginInput, RegisterInput } from '../validators/auth.schemas';

// Cost factor 12: ~250ms of deliberate slowness per hash. Slow is the
// FEATURE — it caps an attacker's guesses-per-second if the hash database
// ever leaks. (Tune upward as hardware gets faster.)
const BCRYPT_COST = 12;

// Short-lived on purpose: a stolen token expires; re-login is the refresh
// mechanism until a refresh-token flow exists.
const TOKEN_LIFETIME = '1h';

// Timing defense: when the email is unknown we still run one bcrypt
// compare (against this throwaway hash) so "no such user" takes the same
// ~250ms as "wrong password" — otherwise response TIME reveals which
// emails exist even though the message doesn't.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', BCRYPT_COST);

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

export async function loginUser(input: LoginInput): Promise<{ token: string }> {
  const user = await usersRepository.findByEmail(input.email);

  if (user === undefined) {
    await bcrypt.compare(input.password, DUMMY_HASH); // constant-time-ish path
    throw new UnauthorizedError(); // same message, same duration as below
  }

  const matches = await bcrypt.compare(input.password, user.passwordHash);
  if (!matches) {
    throw new UnauthorizedError();
  }

  // The payload is CLAIMS, not data storage: sub(ject) = who this token
  // speaks for. Anyone can READ the payload (it's only base64) — the
  // signature is what makes it unforgeable, not unreadable.
  const token = jwt.sign({}, config.jwtSecret, {
    subject: user.id,
    expiresIn: TOKEN_LIFETIME,
  });

  return { token };
}
