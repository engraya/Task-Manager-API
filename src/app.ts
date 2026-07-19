// app.ts — the Express APPLICATION: middleware and routes live here.
// Deliberately no .listen() in this file: building the app and running a
// server are separate concerns. Tests (Phase 12) will import this app and
// drive it without ever opening a network port.

import express, { type Request, type Response } from 'express';
import { config } from './config';
import { isDatabaseConnected } from './database/connection';
import { NotFoundError } from './errors/app-error';
import { errorHandler } from './middlewares/error-handler';
import { requestLogger } from './middlewares/request-logger';
import tasksRouter from './routes/tasks.routes';

interface HealthResponse {
  status: 'ok' | 'degraded';
  uptime: number;
  environment: string;
  database: 'connected' | 'disconnected';
}

const app = express();

// First layer on purpose: subscribes before anything can respond, so every
// request gets logged — including 404s and parse failures.
app.use(requestLogger);

// Body-parsing middleware — for requests with Content-Type: application/json
// it parses the body stream and puts the result on req.body before any
// route runs.
app.use(express.json());

// Health check — polled by load balancers / uptime monitors. Outside
// /api/v1 on purpose: it describes the process, not the domain.
// Since Phase 9 it reports READINESS, not just liveness: a process whose
// database link dropped answers 503 so traffic routes elsewhere.
app.get('/health', (_req: Request, res: Response) => {
  const dbConnected = isDatabaseConnected();
  const health: HealthResponse = {
    status: dbConnected ? 'ok' : 'degraded',
    uptime: process.uptime(),
    environment: config.nodeEnv,
    database: dbConnected ? 'connected' : 'disconnected',
  };
  res.status(dbConnected ? 200 : 503).json(health);
});

// The tasks resource — router handles everything under this prefix.
app.use('/api/v1/tasks', tasksRouter);

// Fallback — reached only if no route above matched. It doesn't format
// anything; like every other error source it just throws, and the error
// handler below turns it into the contract envelope.
app.use((req: Request) => {
  throw new NotFoundError(`Cannot ${req.method} ${req.originalUrl}`);
});

// FINAL layer: the error handler. Four-argument signature = error
// middleware; must be registered after everything it protects.
app.use(errorHandler);

export default app;
