// middlewares/require-auth.ts — the authentication gate.
//
// Placed in front of protected routers, it either proves who the caller is
// (and records it on req.userId) or ends the request with 401. Controllers
// behind it never see an anonymous request.

import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UnauthorizedError } from '../errors/app-error';

const BEARER_PREFIX = 'Bearer ';

export const requireAuth: RequestHandler = (req, _res, next) => {
  // Node lowercases incoming header names, so this is THE authorization
  // header regardless of how the client capitalized it.
  const header = req.headers.authorization;

  // Missing or non-Bearer credentials: the caller didn't even attempt our
  // scheme. Distinct message from "bad token" — no secret is leaked by
  // telling an anonymous caller that authentication is required.
  if (header === undefined || !header.startsWith(BEARER_PREFIX)) {
    throw new UnauthorizedError('Authentication required');
  }

  const token = header.slice(BEARER_PREFIX.length);

  // verify() recomputes the signature with OUR secret and checks exp.
  // It THROWS on any failure (tampered, forged, expired, malformed) — we
  // translate every variant to one vague 401. Which check failed is
  // debugging detail for us, not information for the caller.
  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }

  // Boundary rule, one more time: a verified token proves the payload is
  // ours, not that it has the shape we expect. Narrow before trusting.
  if (typeof payload === 'string' || typeof payload.sub !== 'string') {
    throw new UnauthorizedError('Invalid or expired token');
  }

  req.userId = payload.sub;
  next();
};
