import type { RequestHandler } from 'express';

import { getServerEnv } from '../config/env.js';
import { unauthorized } from '../lib/errors.js';
import { SESSION_COOKIE, verifySessionToken } from '../lib/session.js';

export const requireAuth: RequestHandler = (req, _res, next) => {
  const env = getServerEnv();
  const session = verifySessionToken(env.SESSION_SECRET, req.cookies?.[SESSION_COOKIE] as string | undefined);

  if (!session) {
    next(unauthorized());
    return;
  }

  req.session = session;
  next();
};
