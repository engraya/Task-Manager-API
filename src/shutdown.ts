// shutdown.ts — GRACEFUL SHUTDOWN.
//
// When the platform wants to stop the process (a deploy, a scale-down, `docker
// stop`, Ctrl-C), it sends a signal. The DEFAULT reaction is instant death:
// every in-flight request is dropped mid-response and the DB connection is
// severed abruptly. Graceful shutdown instead: stop taking NEW work, let the
// work already in progress FINISH, close resources cleanly, then exit. Deploys
// become seamless instead of lossy.
//
// Extracted from server.ts so it's reusable and testable in isolation (the
// server's start() has an import-time side effect; this doesn't).

import type { Server } from 'node:http';
import { logger } from './logger';

// How long to wait for in-flight requests to drain before giving up. The
// platform will SIGKILL us after its own grace period anyway, so we bound our
// wait and exit on our own terms first if something is stuck.
const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Wire SIGTERM/SIGINT to a graceful shutdown:
 *   1. stop accepting new connections (server.close)
 *   2. wait for in-flight requests to finish (server.close's callback)
 *   3. run onClose (e.g. disconnect the database)
 *   4. exit 0 — or exit 1 if a timeout/error forces it
 */
export function registerGracefulShutdown(
  server: Server,
  onClose: () => Promise<void>,
): void {
  // Guard against a second signal (impatient Ctrl-C, or SIGINT then SIGTERM)
  // re-entering and double-closing.
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutdown signal received — draining in-flight requests');

    // Backstop: if draining hangs (a stuck socket, a slow query), force exit
    // rather than wait forever. .unref() so this timer itself never keeps the
    // process alive once everything else has finished.
    const forceTimer = setTimeout(() => {
      logger.error(
        { timeoutMs: SHUTDOWN_TIMEOUT_MS },
        'Graceful shutdown timed out — forcing exit',
      );
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceTimer.unref();

    try {
      // server.close stops NEW connections immediately and fires its callback
      // only once all in-flight responses have completed. Promisify it.
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });

      // No requests in flight now — safe to close downstream resources.
      await onClose();

      clearTimeout(forceTimer);
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      clearTimeout(forceTimer);
      logger.error({ err }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  // SIGTERM: the platform asking us to stop (deploy, scale-down, `docker stop`).
  // SIGINT:  Ctrl-C in an interactive terminal. Handle both the same way.
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}
