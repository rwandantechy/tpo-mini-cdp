import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { buildTestApp } from './helpers/testApp.js';

describe('POST /api/segments/preview', () => {
  it('refuses an anonymous caller before touching the database', async () => {
    const app = await buildTestApp();
    const response = await request(app).post('/api/segments/preview').send({ definition: {} });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('unauthorized');
  });
});
