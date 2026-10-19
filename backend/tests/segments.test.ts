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

describe('DELETE /api/segments/:id', () => {
  it('refuses an anonymous caller', async () => {
    const app = await buildTestApp();
    const response = await request(app).delete('/api/segments/00000000-0000-4000-8000-000000000000');

    expect(response.status).toBe(401);
  });
});
