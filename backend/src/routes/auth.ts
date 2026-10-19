import { type CookieOptions, type Request, type Response, Router } from 'express';
import { z } from 'zod';

import { PASSWORD_MAX_LENGTH, SESSION_SUBJECT, SESSION_TTL_SECONDS } from '../config/constants.js';
import { getServerEnv } from '../config/env.js';
import { unauthorized } from '../lib/errors.js';
import { log } from '../lib/logger.js';
import { verifyPassword } from '../lib/password.js';
import { createSessionToken, SESSION_COOKIE, verifySessionToken } from '../lib/session.js';
import type { Limiters } from '../middleware/rateLimit.js';

const loginSchema = z.object({
  password: z.string().min(1, 'Enter the password.').max(PASSWORD_MAX_LENGTH),
});

function cookieOptions(): CookieOptions {
  const env = getServerEnv();

  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000,
  };
}

export function authRouter(limiters: Limiters): Router {
  const router = Router();

  router.post('/login', limiters.login, async (req: Request, res: Response) => {
    const { password } = loginSchema.parse(req.body);
    const env = getServerEnv();

    const ok = await verifyPassword(password, env.APP_PASSWORD_HASH);
    if (!ok) {
      log.warn('failed sign-in');
      throw unauthorized('That password is not right.');
    }

    res.cookie(SESSION_COOKIE, createSessionToken(env.SESSION_SECRET, SESSION_SUBJECT), cookieOptions());
    res.json({ authenticated: true, user: SESSION_SUBJECT });
  });

  router.post('/logout', (_req: Request, res: Response) => {
    res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
    res.json({ authenticated: false });
  });

  router.get('/session', (req: Request, res: Response) => {
    const env = getServerEnv();
    const session = verifySessionToken(env.SESSION_SECRET, req.cookies?.[SESSION_COOKIE] as string | undefined);

    res.json(session ? { authenticated: true, user: session.sub } : { authenticated: false });
  });

  return router;
}
