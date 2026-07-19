// server.ts — the process ENTRY POINT.
// Startup ORDER matters: connect to the database BEFORE accepting traffic.
// A server that listens first would answer its earliest requests with
// errors during the connection window; connect-then-listen means the
// first request we ever accept is one we can actually serve.

import app from './app';
import { config } from './config';
import { connectToDatabase } from './database/connection';

async function start(): Promise<void> {
  await connectToDatabase();
  console.log('Connected to MongoDB');

  app.listen(config.port, () => {
    console.log(
      `Server listening on http://localhost:${config.port} (${config.nodeEnv})`,
    );
  });
}

start().catch((err: unknown) => {
  // Startup failures are fatal by design: crash loudly, let the platform
  // restart us — never limp along half-initialized (docs/16, fail-fast).
  console.error('Failed to start:', err);
  process.exit(1);
});
