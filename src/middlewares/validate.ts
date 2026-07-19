// middlewares/validate.ts — a middleware FACTORY: give it a zod schema, get
// back a middleware that validates req.body against it.
//
// On failure: the request ends here with the contract's 422 envelope — the
// controller never runs.
// On success: req.body is REPLACED with the parsed result, so downstream
// code receives the transformed values (trimmed title, UTC-normalized
// dates), not the raw client bytes.

import type { RequestHandler } from 'express';
import { ZodError, type ZodType } from 'zod';
import type { ApiError, ApiErrorDetail } from '../types/api';

// Translate zod's issue list into our contract's error details. Kept here —
// beside the only code that needs it — so the schemas file stays pure.
export function zodIssuesToDetails(error: ZodError): ApiErrorDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : 'body',
    message: issue.message,
  }));
}

export function validateBody(schema: ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const body: ApiError = {
        error: {
          message: 'Validation failed',
          details: zodIssuesToDetails(result.error),
        },
      };
      res.status(422).json(body);
      return;
    }

    req.body = result.data;
    next();
  };
}
