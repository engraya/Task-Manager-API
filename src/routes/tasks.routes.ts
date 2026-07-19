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

const tasksRouter = Router();

tasksRouter.get('/', listTasks);
tasksRouter.post('/', createTask);
tasksRouter.get('/:id', getTask);
tasksRouter.patch('/:id', updateTask);
tasksRouter.delete('/:id', deleteTask);

export default tasksRouter;
