// errors/app-error.ts — typed errors for OPERATIONAL failures.
//
// The load-bearing distinction (docs/10-Error-Handling.md):
//   OPERATIONAL errors — expected failure modes of a healthy system: task
//     not found, invalid input, (later) auth failures. They map to a 4xx
//     status and a client-safe message. Represented as AppError subclasses.
//   PROGRAMMER errors — bugs: undefined property reads, broken invariants.
//     NOT representable here on purpose; anything that isn't an AppError is
//     treated as a bug by the error handler (500, log fully, leak nothing).

import type { ApiErrorDetail } from '../types/api';

export class AppError extends Error {
  readonly statusCode: number;
  readonly details?: ApiErrorDetail[];

  constructor(statusCode: number, message: string, details?: ApiErrorDetail[]) {
    super(message);
    this.name = new.target.name; // subclass name shows up in logs/stacks
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, new.target); // stack starts at the throw site
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, message);
  }
}

export class ValidationError extends AppError {
  constructor(details: ApiErrorDetail[], message = 'Validation failed') {
    super(422, message, details);
  }
}
