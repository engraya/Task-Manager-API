// routes/tasks.routes.ts — everything under /api/v1/tasks.
// The router only knows RELATIVE paths ('/'); the mount point is app.ts's
// decision. This router currently also holds the data and the handler
// logic — deliberately. Phases 4–5 will extract controllers and services
// when the pressure to do so becomes visible.

import { Router, type Request, type Response } from 'express';
import type { Task } from '../types/task';

// TEMPORARY in-memory store. Lives in process memory, so it dies on every
// restart (and tsx restarts on every save!) — see docs/13-Response-Lifecycle
// on process lifetime. Phase 8 gives tasks a real home.
const tasks: Task[] = [];

const tasksRouter = Router();

// GET /api/v1/tasks — list tasks.
// Contract: 200 with Task[]; an empty collection is 200 + [], never 404.
tasksRouter.get('/', (_req: Request, res: Response) => {
  res.status(200).json(tasks);
});

export default tasksRouter;
