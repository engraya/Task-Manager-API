// middlewares/request-logger.ts — per-request logging with a CORRELATION ID.
//
// The production superpower: every log line from a single request carries the
// same `reqId`, so when one user's call fails you can pull EVERY line for that
// exact request out of a firehose of thousands and read the request's whole
// story end to end. Without correlation, logs are a pile of disconnected lines;
// with it, they're threads you can follow.
//
// (In real projects `pino-http` does this for you. We hand-roll it once so the
// mechanism — child logger + id + status-based level — is visible, not magic.)

import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { logger } from '../logger';

const REQUEST_ID_HEADER = 'x-request-id';

export const requestLogger: RequestHandler = (req, res, next) => {
  // Reuse an id from upstream (a proxy / API gateway / calling service) if one
  // arrived, so a single request stays traceable ACROSS services; otherwise
  // mint a fresh one. This is how correlation spans a whole system.
  const incoming = req.headers[REQUEST_ID_HEADER];
  const reqId = typeof incoming === 'string' && incoming ? incoming : randomUUID();

  req.id = reqId;
  // A CHILD logger inherits the parent's config but stamps { reqId } onto every
  // line logged through it. Handing this to controllers/services (via req.log)
  // is what threads all of a request's logs together.
  const log = logger.child({ reqId });
  req.log = log;

  // Echo the id back so a client can quote it in a bug report ("request
  // <id> failed") and we can jump straight to that request's logs.
  res.setHeader('X-Request-Id', reqId);

  // hrtime.bigint() is a monotonic clock — immune to system clock changes, the
  // right tool for measuring an elapsed duration.
  const startedAt = process.hrtime.bigint();

  // 'received' at debug: visible while developing, hidden in production (level
  // info), so prod gets one line per request (the completion) unless debugging.
  log.debug({ method: req.method, url: req.originalUrl }, 'request received');

  // The status and duration exist only AFTER the response is written; 'finish'
  // fires when the last byte is handed to the kernel (docs/13).
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    // Level FROM the status code: a log query for "level >= warn" then surfaces
    // exactly the failed responses without you enumerating status codes.
    const level: 'info' | 'warn' | 'error' =
      res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    log[level](
      {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(1)),
      },
      'request completed',
    );
  });

  next();
};
