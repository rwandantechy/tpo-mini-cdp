import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { buildTestApp } from './helpers/testApp.js';

describe('GET /api/subscribers', () => {
  it('refuses an anonymous caller before touching the database', async () => {
    const app = await buildTestApp();
    const response = await request(app).get('/api/subscribers').query({ q: 'emily' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('unauthorized');
  });
});

describe('GET /api/subscribers/:id', () => {
  it('refuses an anonymous caller before touching the database', async () => {
    const app = await buildTestApp();
    const response = await request(app).get('/api/subscribers/00000000-0000-4000-8000-000000000000');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('unauthorized');
  });
});
