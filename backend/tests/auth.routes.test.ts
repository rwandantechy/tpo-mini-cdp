import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { RATE_LIMITS, SESSION_SUBJECT } from '../src/config/constants.js';
import { SESSION_COOKIE } from '../src/lib/session.js';
import { randomCredential, TEST_PASSWORD } from './helpers/credentials.js';
import { buildTestApp, cookieValue, TEST_CORS_ORIGIN } from './helpers/testApp.js';

describe('POST /api/auth/login', () => {
  let app: Express;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  it('sets an httpOnly session cookie for the right password', async () => {
    const response = await request(app).post('/api/auth/login').send({ password: TEST_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ authenticated: true, user: SESSION_SUBJECT });

    const header = response.headers['set-cookie'] as unknown as string[];
    const cookie = header.find((entry) => entry.startsWith(`${SESSION_COOKIE}=`));

    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
  });

  it('rejects the wrong password without issuing a cookie', async () => {
    const response = await request(app).post('/api/auth/login').send({ password: randomCredential('wrong') });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('unauthorized');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('never echoes the password back, in any form', async () => {
    const attempted = randomCredential('attempt');
    const response = await request(app).post('/api/auth/login').send({ password: attempted });

    expect(JSON.stringify(response.body)).not.toContain(attempted);
    expect(JSON.stringify(response.headers)).not.toContain(attempted);
  });

  it('validates the body', async () => {
    await expect(request(app).post('/api/auth/login').send({}).then((r) => r.status)).resolves.toBe(400);
    await expect(request(app).post('/api/auth/login').send({ password: '' }).then((r) => r.status)).resolves.toBe(400);
    await expect(
      request(app).post('/api/auth/login').send({ password: 123 }).then((r) => r.status),
    ).resolves.toBe(400);
  });

  it('stops guessing after the login rate limit', async () => {
    for (let attempt = 0; attempt < RATE_LIMITS.login.limit; attempt += 1) {
      const response = await request(app).post('/api/auth/login').send({ password: randomCredential('guess') });
      expect(response.status).toBe(401);
    }

    const blocked = await request(app).post('/api/auth/login').send({ password: randomCredential('guess') });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('too_many_requests');

    const stillBlocked = await request(app).post('/api/auth/login').send({ password: TEST_PASSWORD });
    expect(stillBlocked.status).toBe(429);
  });

  it('marks the cookie Secure and SameSite=None when configured for cross-origin use', async () => {
    const crossOrigin = await buildTestApp({ COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'true' });
    const response = await request(crossOrigin).post('/api/auth/login').send({ password: TEST_PASSWORD });

    const cookie = (response.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/SameSite=None/i);
    expect(cookie).toMatch(/Secure/i);
  });
});

describe('GET /api/auth/session', () => {
  let app: Express;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  it('reports an anonymous visitor', async () => {
    const response = await request(app).get('/api/auth/session');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ authenticated: false });
  });

  it('recognises a signed cookie', async () => {
    const login = await request(app).post('/api/auth/login').send({ password: TEST_PASSWORD });
    const token = cookieValue(login.headers['set-cookie'] as unknown as string[], SESSION_COOKIE);

    const response = await request(app).get('/api/auth/session').set('Cookie', `${SESSION_COOKIE}=${token}`);
    expect(response.body).toEqual({ authenticated: true, user: SESSION_SUBJECT });
  });

  it('ignores a tampered cookie', async () => {
    const login = await request(app).post('/api/auth/login').send({ password: TEST_PASSWORD });
    const token = cookieValue(login.headers['set-cookie'] as unknown as string[], SESSION_COOKIE) ?? '';
    const tampered = `${token.slice(0, -4)}0000`;

    const response = await request(app).get('/api/auth/session').set('Cookie', `${SESSION_COOKIE}=${tampered}`);
    expect(response.body).toEqual({ authenticated: false });
  });

  it('ignores a cookie that was simply invented', async () => {
    const payload = Buffer.from(JSON.stringify({ sub: SESSION_SUBJECT, exp: 9_999_999_999 }), 'utf8').toString('base64url');
    const response = await request(app)
      .get('/api/auth/session')
      .set('Cookie', `${SESSION_COOKIE}=${payload}.${'0'.repeat(8)}`);

    expect(response.body).toEqual({ authenticated: false });
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the cookie', async () => {
    const app = await buildTestApp();
    const response = await request(app).post('/api/auth/logout');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ authenticated: false });

    const cookie = (response.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toContain(`${SESSION_COOKIE}=;`);
  });
});

describe('CORS', () => {
  it('allows the configured origin with credentials', async () => {
    const app = await buildTestApp();
    const response = await request(app).get('/api/auth/session').set('Origin', TEST_CORS_ORIGIN);

    expect(response.headers['access-control-allow-origin']).toBe(TEST_CORS_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('refuses an origin that is not on the allowlist', async () => {
    const app = await buildTestApp();
    const response = await request(app).get('/api/auth/session').set('Origin', 'https://evil.example');

    expect(response.status).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows the Vercel deployment that is serving this build', async () => {
    const previous = process.env.VERCEL_URL;
    process.env.VERCEL_URL = 'mini-cdp-git-preview.vercel.app';

    try {
      const app = await buildTestApp();
      const origin = 'https://mini-cdp-git-preview.vercel.app';
      const response = await request(app).get('/api/auth/session').set('Origin', origin);

      expect(response.headers['access-control-allow-origin']).toBe(origin);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    } finally {
      if (previous === undefined) delete process.env.VERCEL_URL;
      else process.env.VERCEL_URL = previous;
    }
  });
});

describe('unknown routes', () => {
  it('return a plain 404 with no framework detail', async () => {
    const app = await buildTestApp();
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('not_found');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
