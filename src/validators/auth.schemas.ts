// validators/auth.schemas.ts — zod schemas for the auth endpoints.

import { z } from 'zod';

export const registerSchema = z.strictObject({
  // Normalized to lowercase AT THE BOUNDARY: "Ada@Example.com" and
  // "ada@example.com" are the same account, decided once, here — the
  // unique index then only ever sees canonical form.
  email: z
    .email({ message: 'email must be a valid email address' })
    .transform((value) => value.toLowerCase()),
  // Max 72: bcrypt only reads the first 72 bytes of input — accepting
  // longer passwords would silently ignore the tail. Honest limits only.
  password: z
    .string({ message: 'password is required and must be a string' })
    .min(8, { message: 'password must be at least 8 characters' })
    .max(72, { message: 'password must be at most 72 characters' }),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// Login validates SHAPE only — no min-length rule: the password policy is
// register's business; login's only question is "does this match?", and a
// too-short attempt should fail with the same vague 401 as any wrong
// password, not a helpful 422.
export const loginSchema = z.strictObject({
  email: z
    .email({ message: 'email must be a valid email address' })
    .transform((value) => value.toLowerCase()),
  password: z.string({ message: 'password is required and must be a string' }),
});

export type LoginInput = z.infer<typeof loginSchema>;
