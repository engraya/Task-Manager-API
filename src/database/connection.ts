// database/connection.ts — owns the MongoDB connection lifecycle.
// Nothing else in the codebase calls mongoose.connect/disconnect; the
// server's startup sequence (server.ts) and /health are the only consumers.

import mongoose from 'mongoose';
import { config } from '../config';

export async function connectToDatabase(): Promise<void> {
  // Fail fast at startup — a missing database URI is a configuration
  // error, not something to discover on the first request.
  await mongoose.connect(config.mongoUri);
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect();
}

// readyState 1 = connected. Used by /health to report READINESS ("can I
// actually do my job?") as opposed to liveness ("is the process up?").
export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
