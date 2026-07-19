// middlewares/request-logger.ts — one log line per COMPLETED request:
//   GET /api/v1/tasks -> 200 (3.2 ms)
//
// Structure of every middleware: do work, then either call next() to pass
// the request down the stack, or respond to end the walk. This one always
// passes — logging observes, it never decides.

import type { RequestHandler } from 'express';

export const requestLogger: RequestHandler = (req, res, next) => {
  // hrtime.bigint() is a monotonic clock: it only moves forward, immune to
  // system clock adjustments — the right tool for measuring durations.
  const startedAt = process.hrtime.bigint();

  // We run BEFORE the handler, but the status/duration exist only AFTER the
  // response is written. The 'finish' event (docs/13) fires when the last
  // byte is handed to the kernel — so we subscribe now, log later.
  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    console.log(
      `${req.method} ${req.originalUrl} -> ${res.statusCode} (${elapsedMs.toFixed(1)} ms)`,
    );
  });

  next();
};
