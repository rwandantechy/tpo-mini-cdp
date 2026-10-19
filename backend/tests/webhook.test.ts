import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { SIGNATURE_HEADER, TIMESTAMP_HEADER, signPayload } from '../src/lib/hmac.js';
import { TEST_WEBHOOK_SECRET, randomCredential } from './helpers/credentials.js';
import { buildTestApp } from './helpers/testApp.js';

const SAMPLE = {
  event_id: 'evt_9f3a1c',
  event: 'read_story',
  user_id: 'u_2b6447a3',
  device_id: 'd_4b21e8',
  timestamp: '2026-09-28T14:22:05Z',
  properties: { story: 'supreme-court-ruling-explained' },
};

function signed(body: unknown, secret = TEST_WEBHOOK_SECRET) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    raw,
    timestamp,
    signature: signPayload(secret, raw, timestamp),
  };
}

async function postWebhook(body: unknown, headers: Record<string, string> = {}) {
  const app = await buildTestApp();
  const { raw, timestamp, signature } = signed(body);

  return request(app)
    .post('/webhooks/app')
    .set(TIMESTAMP_HEADER, timestamp)
    .set(SIGNATURE_HEADER, signature)
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(raw);
}

describe('POST /webhooks/app authentication', () => {
  it('refuses a request with no signature', async () => {
    const app = await buildTestApp();
    const response = await request(app)
      .post('/webhooks/app')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(SAMPLE));

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('unauthorized');
  });

  it('refuses a session cookie in place of a webhook signature', async () => {
    const app = await buildTestApp();
    const response = await request(app)
      .post('/webhooks/app')
      .set('Cookie', 'tpo_session=not-a-signature')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(SAMPLE));

    expect(response.status).toBe(401);
  });

  it('refuses a body that changed after signing', async () => {
    const app = await buildTestApp();
    const { timestamp, signature } = signed(SAMPLE);
    const tampered = { ...SAMPLE, user_id: 'u_someone_else' };

    const response = await request(app)
      .post('/webhooks/app')
      .set(TIMESTAMP_HEADER, timestamp)
      .set(SIGNATURE_HEADER, signature)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(tampered));

    expect(response.status).toBe(401);
  });

  it('refuses a signature made with the wrong secret', async () => {
    const app = await buildTestApp();
    const { raw, timestamp, signature } = signed(SAMPLE, randomCredential('other'));

    const response = await request(app)
      .post('/webhooks/app')
      .set(TIMESTAMP_HEADER, timestamp)
      .set(SIGNATURE_HEADER, signature)
      .set('Content-Type', 'application/json')
      .send(raw);

    expect(response.status).toBe(401);
  });
});

describe('POST /webhooks/app validation', () => {
  it('rejects a signed body that is not JSON', async () => {
    const response = await postWebhook('not-json');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('bad_request');
  });

  it('rejects a signed payload missing required fields', async () => {
    const response = await postWebhook({ event: 'app_open' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('invalid_request');
  });

  it('rejects a login without a user_id', async () => {
    const response = await postWebhook({
      event_id: `evt_${randomUUID()}`,
      event: 'login',
      device_id: 'd_4b21e8',
      timestamp: '2026-09-28T14:22:05Z',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'user_id' })]),
    );
  });

  it('rejects an unknown event name', async () => {
    const response = await postWebhook({
      ...SAMPLE,
      event_id: `evt_${randomUUID()}`,
      event: 'purchase',
    });

    expect(response.status).toBe(400);
  });
});
