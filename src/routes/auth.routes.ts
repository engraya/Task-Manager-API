// routes/auth.routes.ts — wiring for /api/v1/auth.

import { Router } from 'express';
import { register } from '../controllers/auth.controller';
import { validateBody } from '../middlewares/validate';
import { registerSchema } from '../validators/auth.schemas';

const authRouter = Router();

authRouter.post('/register', validateBody(registerSchema), register);

export default authRouter;
