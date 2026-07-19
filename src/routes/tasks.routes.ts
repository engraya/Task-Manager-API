// routes/tasks.routes.ts — wiring only: which (method, path) invokes which
// controller. No logic lives here; if you're looking for behavior, it's in
// ../controllers/tasks.controller.ts.
//
// Order note: literal paths would need to precede '/:id'; with only these
// five routes the param routes come last on principle.

import { Router } from 'express';
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  updateTask,
} from '../controllers/tasks.controller';
import { requireAuth } from '../middlewares/require-auth';
import { validateBody } from '../middlewares/validate';
import { createTaskSchema, updateTaskSchema } from '../validators/task.schemas';

const tasksRouter = Router();

// Router-level gate: registered before every route below, so ALL task
// endpoints require a valid token. One line here beats five copies in the
// route chains — and makes "which routes are protected?" answerable at a
// glance: everything on this router.
tasksRouter.use(requireAuth);

// Per-route middleware chains: the request passes left to right. Reading
// this file now tells you each endpoint's validation policy at a glance.
tasksRouter.get('/', listTasks);
tasksRouter.post('/', validateBody(createTaskSchema), createTask);
tasksRouter.get('/:id', getTask);
tasksRouter.patch('/:id', validateBody(updateTaskSchema), updateTask);
tasksRouter.delete('/:id', deleteTask);

export default tasksRouter;
