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
