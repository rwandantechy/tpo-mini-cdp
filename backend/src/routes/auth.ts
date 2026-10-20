import { type CookieOptions, type Request, type Response, Router } from 'express';
import { z } from 'zod';

import { PASSWORD_MAX_LENGTH, SESSION_TTL_SECONDS } from '../config/constants.js';
import { getServerEnv } from '../config/env.js';
import { unauthorized } from '../lib/errors.js';
import { log } from '../lib/logger.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { createSessionToken, isAccountSession, SESSION_COOKIE, verifySessionToken } from '../lib/session.js';
import type { Limiters } from '../middleware/rateLimit.js';
import { findAuthAccountByEmail, type AuthAccount } from '../services/authAccounts.js';

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1, 'Enter the password.').max(PASSWORD_MAX_LENGTH),
});
const dummyPasswordHash = hashPassword('nonexistent-account password');

export interface AuthAccountLookup {
  findByEmail(email: string): Promise<AuthAccount | null>;
}

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

export function authRouter(limiters: Limiters, accounts: AuthAccountLookup = { findByEmail: findAuthAccountByEmail }): Router {
  const router = Router();

  router.post('/login', limiters.login, async (req: Request, res: Response) => {
    const { email, password } = loginSchema.parse(req.body);
    const env = getServerEnv();
    const account = await accounts.findByEmail(email);
    const passwordMatches = await verifyPassword(password, account?.passwordHash ?? await dummyPasswordHash);
    if (!account || !passwordMatches) {
      log.warn('failed sign-in');
      throw unauthorized('Email or password is not right.');
    }

    res.cookie(
      SESSION_COOKIE,
      createSessionToken(env.SESSION_SECRET, account.id, undefined, undefined, account.email),
      cookieOptions(),
    );
    res.json({ authenticated: true, user: account.email });
  });

  router.post('/logout', (_req: Request, res: Response) => {
    res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
    res.json({ authenticated: false });
  });

  router.get('/session', (req: Request, res: Response) => {
    const env = getServerEnv();
    const session = verifySessionToken(env.SESSION_SECRET, req.cookies?.[SESSION_COOKIE] as string | undefined);

    res.json(isAccountSession(session)
      ? { authenticated: true, user: session.email }
      : { authenticated: false });
  });

  return router;
}
