// app.ts — the Express APPLICATION: middleware and routes live here.
// Deliberately no .listen() in this file: building the app and running a
// server are separate concerns. Tests (Phase 12) will import this app and
// drive it without ever opening a network port.

import express, { type Request, type Response } from 'express';
import { config } from './config';
import tasksRouter from './routes/tasks.routes';
import type { ApiError } from './types/api';

interface HealthResponse {
  status: 'ok';
  uptime: number;
  environment: string;
}

const app = express();

// Body-parsing middleware — for requests with Content-Type: application/json
// it parses the body stream and puts the result on req.body before any
// route runs.
app.use(express.json());

// Health check — polled by load balancers / uptime monitors. Outside
// /api/v1 on purpose: it describes the process, not the domain.
app.get('/health', (_req: Request, res: Response) => {
  const health: HealthResponse = {
    status: 'ok',
    uptime: process.uptime(),
    environment: config.nodeEnv,
  };
  res.status(200).json(health);
});

// The tasks resource — router handles everything under this prefix.
app.use('/api/v1/tasks', tasksRouter);

// Fallback — Express only reaches this if no route above matched.
// Error shape per docs/API-Contract.md.
app.use((req: Request, res: Response) => {
  const body: ApiError = {
    error: { message: `Cannot ${req.method} ${req.originalUrl}` },
  };
  res.status(404).json(body);
});

export default app;
