// routes/auth.routes.ts — wiring for /api/v1/auth.

import { Router } from 'express';
import { login, register } from '../controllers/auth.controller';
import { validateBody } from '../middlewares/validate';
import { loginSchema, registerSchema } from '../validators/auth.schemas';

const authRouter = Router();

authRouter.post('/register', validateBody(registerSchema), register);
authRouter.post('/login', validateBody(loginSchema), login);

export default authRouter;
