// app.ts — the Express APPLICATION: middleware and routes live here.
// Deliberately no .listen() in this file: building the app and running a
// server are separate concerns. Tests (Phase 12) will import this app and
// drive it without ever opening a network port.

import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import { config } from './config';
import { isDatabaseConnected } from './database/connection';
import { NotFoundError } from './errors/app-error';
import { errorHandler } from './middlewares/error-handler';
import { requestLogger } from './middlewares/request-logger';
import authRouter from './routes/auth.routes';
import tasksRouter from './routes/tasks.routes';

interface HealthResponse {
  status: 'ok' | 'degraded';
  uptime: number;
  environment: string;
  database: 'connected' | 'disconnected';
}

const app = express();

// Don't advertise the framework. Express sends `X-Powered-By: Express` by
// default — free reconnaissance telling an attacker exactly what to target.
// (helmet also strips it; being explicit documents the intent.)
app.disable('x-powered-by');

// Behind a reverse proxy / load balancer, the real client IP and protocol
// arrive in X-Forwarded-* headers. `trust proxy` says how many proxy hops to
// trust so req.ip / req.protocol reflect the actual client. Default 0 (trust
// none); trusting more hops than exist lets a client SPOOF its IP via a forged
// X-Forwarded-For, so this is config-driven per deployment (docs/32).
app.set('trust proxy', config.trustProxy);

// First layer on purpose: subscribes before anything can respond, so every
// request gets logged — including 404s and parse failures.
app.use(requestLogger);

// Security headers on every response: helmet sets a suite of sensible
// defaults (HSTS, X-Content-Type-Options: nosniff, X-Frame-Options: DENY,
// etc.) that harden the app against common browser-side attack vectors.
app.use(helmet());

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

// Resource routers — one mount per resource.
app.use('/api/v1/auth', authRouter);
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
