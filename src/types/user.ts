// types/user.ts — the User shapes per docs/API-Contract.md (auth section).

// Internal shape. passwordHash exists ONLY between the service and storage —
// it must never appear in a response, a log line, or a JWT.
export interface User {
  id: string; // UUID, server-generated
  email: string; // unique, stored lowercase
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

// What API responses carry. The conversion User -> PublicUser is explicit
// (auth service) so "forgot to strip the hash" is structurally impossible.
export interface PublicUser {
  id: string;
  email: string;
  createdAt: string;
}

export function toPublicUser(user: User): PublicUser {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}
