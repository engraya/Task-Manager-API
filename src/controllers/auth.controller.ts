// controllers/auth.controller.ts — HTTP layer for authentication.

import type { RequestHandler } from 'express';
import * as authService from '../services/auth.service';
import type { LoginInput, RegisterInput } from '../validators/auth.schemas';

export const register: RequestHandler = async (req, res) => {
  // Guaranteed by validateBody(registerSchema) in the route chain.
  const input = req.body as RegisterInput;

  const user = await authService.registerUser(input);
  res.status(201).json(user); // PublicUser — the hash cannot be here
};

export const login: RequestHandler = async (req, res) => {
  // Guaranteed by validateBody(loginSchema) in the route chain.
  const input = req.body as LoginInput;

  const result = await authService.loginUser(input);
  res.status(200).json(result); // { token }
};
