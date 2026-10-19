import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { SESSION_COOKIE } from '../src/lib/session.js';
import { buildTestApp } from './helpers/testApp.js';

describe('GET /api/overview', () => {
  it('refuses an anonymous caller before touching the database', async () => {
    const app = await buildTestApp();
    const response = await request(app).get('/api/overview');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('unauthorized');
  });

  it('refuses a forged session cookie', async () => {
    const app = await buildTestApp();
    const response = await request(app).get('/api/overview').set('Cookie', `${SESSION_COOKIE}=made.up`);

    expect(response.status).toBe(401);
  });
});
