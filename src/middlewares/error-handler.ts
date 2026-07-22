// middlewares/error-handler.ts — the pipeline's FINAL layer.
//
// Express recognizes error middleware by its FOUR-argument signature. It
// runs only when a layer calls next(err), throws, or (Express 5) returns a
// rejected promise. This is the single place errors become HTTP responses —
// nothing else in the codebase formats an error status.

import type { ErrorRequestHandler } from 'express';
import { AppError } from '../errors/app-error';
import { logger } from '../logger';
import type { ApiError } from '../types/api';

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  // If the status line already left (mid-stream failure), we cannot change
  // the response — delegate to Express's default, which kills the socket so
  // the client at least knows the response is broken.
  if (res.headersSent) {
    next(err);
    return;
  }

  // Malformed JSON: express.json() forwards a SyntaxError with status 400.
  // A client mistake, not a bug — answer with the contract envelope
  // (this replaces the HTML stack-trace page we shipped since Phase 1).
  if (
    err instanceof SyntaxError &&
    'status' in err &&
    (err as { status?: unknown }).status === 400
  ) {
    const body: ApiError = {
      error: { message: 'Request body must be valid JSON' },
    };
    res.status(400).json(body);
    return;
  }

  // Operational errors: expected failures carrying their own status and
  // client-safe message.
  if (err instanceof AppError) {
    const body: ApiError = {
      error: {
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // Everything else is a BUG: log everything for us, reveal nothing to the
  // client. The message is deliberately generic — stack traces, file paths
  // and library internals never cross the trust boundary.
  //
  // logger.error({ err }, msg): the `err` key triggers pino's error
  // serializer, which records the type, message, and full stack as structured
  // fields — searchable, unlike a console.error string dump.
  logger.error({ err }, 'Unhandled error while processing request');
  const body: ApiError = { error: { message: 'Internal server error' } };
  res.status(500).json(body);
};
