// server.ts — the process ENTRY POINT.
// Startup ORDER matters: connect to the database BEFORE accepting traffic.
// A server that listens first would answer its earliest requests with
// errors during the connection window; connect-then-listen means the
// first request we ever accept is one we can actually serve.

import app from './app';
import { config } from './config';
import { connectToDatabase } from './database/connection';
import { logger } from './logger';

async function start(): Promise<void> {
  await connectToDatabase();
  logger.info('Connected to MongoDB');

  app.listen(config.port, () => {
    // Structured fields (port, env) travel alongside the message, so a log
    // query can filter on them — not buried inside an interpolated string.
    logger.info(
      { port: config.port, env: config.nodeEnv },
      'Server listening',
    );
  });
}

start().catch((err: unknown) => {
  // Startup failures are fatal by design: crash loudly, let the platform
  // restart us — never limp along half-initialized (docs/16, fail-fast).
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
