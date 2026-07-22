// logger.ts — the ONE logger the whole app shares.
//
// Why not console.log? console writes unstructured strings to stdout with no
// level, no timestamp, no way to filter or search. A structured logger emits
// one JSON object per line — { level, time, msg, ...fields } — which log
// aggregators (Datadog, CloudWatch, Loki) parse, index, and let you query:
// "show me every error for userId X in the last hour". console can't do that.

import pino from 'pino';
import { config } from './config';

export const logger = pino({
  level: config.logLevel,

  // REDACTION — the safety net. If any of these paths ever appear in a logged
  // object, pino replaces the value with [redacted] instead of writing it.
  // Logs are the classic accidental-leak channel: a stray `logger.info(req)`
  // must never spill a password or a bearer token to disk (docs/28, docs/31).
  redact: {
    paths: [
      'password',
      '*.password',
      'passwordHash',
      '*.passwordHash',
      'req.headers.authorization',
      'headers.authorization',
      'token',
      '*.token',
    ],
    censor: '[redacted]',
  },

  // In development, pipe through pino-pretty for human-readable, colorized
  // lines. In production, emit raw JSON (one object per line) straight to
  // stdout — the format machines ingest. Never pretty-print in production:
  // it's slower and destroys the structure aggregators depend on.
  ...(config.nodeEnv === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});
