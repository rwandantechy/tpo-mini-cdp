import type { Express } from 'express';

import { createApp } from '../../src/app.js';
import { resetEnvCache } from '../../src/config/env.js';
import { hashPassword } from '../../src/lib/password.js';
import { TEST_PASSWORD, TEST_SESSION_SECRET, TEST_WEBHOOK_SECRET } from './credentials.js';

export const TEST_CORS_ORIGIN = 'http://localhost:5173';

let passwordHash: string | null = null;

/** Mutates process.env. Do not mix with `*.db.test.ts` in the same file. */
export async function buildTestApp(overrides: Record<string, string> = {}): Promise<Express> {
  passwordHash ??= await hashPassword(TEST_PASSWORD);

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/unused';
  process.env.SESSION_SECRET = TEST_SESSION_SECRET;
  process.env.WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  process.env.APP_PASSWORD_HASH = passwordHash;
  process.env.CORS_ORIGINS = TEST_CORS_ORIGIN;
  process.env.COOKIE_SAMESITE = 'lax';
  process.env.COOKIE_SECURE = 'false';
  process.env.TRUST_PROXY = 'false';

  for (const [key, value] of Object.entries(overrides)) process.env[key] = value;

  resetEnvCache();
  return createApp();
}

export function cookieValue(setCookie: string[] | undefined, name: string): string | undefined {
  const header = setCookie?.find((entry) => entry.startsWith(`${name}=`));
  return header?.split(';')[0]?.slice(name.length + 1);
}
