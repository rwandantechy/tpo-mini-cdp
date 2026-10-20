import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { RATE_LIMITS } from '../src/config/constants.js';
import { SESSION_COOKIE } from '../src/lib/session.js';
import { containsPii } from '../src/lib/pii.js';
import { ask, PII_REFUSAL, plainAnswer, systemInstruction } from '../src/services/assistant/ask.js';
import { planQuestion } from '../src/services/assistant/plan.js';
import {
  isGeminiCapacityError,
  isGeminiTimeoutError,
  shouldTryFallback,
  type GeminiClient,
  type GeminiRequest,
  type GeminiTurn,
} from '../src/services/assistant/llm.js';
import { TEST_PASSWORD } from './helpers/credentials.js';
import { buildTestApp, cookieValue } from './helpers/testApp.js';

async function signIn() {
  const app = await buildTestApp();
  const login = await request(app).post('/api/auth/login').send({ password: TEST_PASSWORD });
  const token = cookieValue(login.headers['set-cookie'] as unknown as string[], SESSION_COOKIE);
  return { app, cookie: `${SESSION_COOKIE}=${token}` };
}

function scriptedGemini(script: GeminiTurn[]): GeminiClient & { requests: GeminiRequest[] } {
  const requests: GeminiRequest[] = [];
  let index = 0;

  return {
    requests,
    async generate(request) {
      requests.push({
        ...request,
        contents: JSON.parse(JSON.stringify(request.contents)) as GeminiRequest['contents'],
      });
      return script[index++] ?? { text: 'done' };
    },
  };
}

describe('GET /api/assistant', () => {
  it('refuses an anonymous caller', async () => {
    const app = await buildTestApp();
    const response = await request(app).get('/api/assistant');
    expect(response.status).toBe(401);
  });

  it('says when no key is configured, without calling Gemini', async () => {
    const { app, cookie } = await signIn();
    const response = await request(app).get('/api/assistant').set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ available: false });
  });
});

describe('POST /api/assistant', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  it('refuses an anonymous caller', async () => {
    const response = await request(app).post('/api/assistant').send({ question: 'How many subscribers?' });
    expect(response.status).toBe(401);
  });

  it('blocks a named person before a missing API key would matter', async () => {
    const { app: signed, cookie } = await signIn();
    const response = await request(signed)
      .post('/api/assistant')
      .set('Cookie', cookie)
      .send({ question: 'What did Claire Collins do?' });

    expect(response.status).toBe(200);
    expect(response.body.blocked).toBe(true);
    expect(response.body.answer).toBe(PII_REFUSAL);
    expect(JSON.stringify(response.body)).not.toContain('Claire');
  });

  it('blocks a lowercase name before a missing API key would matter', async () => {
    const { app: signed, cookie } = await signIn();
    const response = await request(signed)
      .post('/api/assistant')
      .set('Cookie', cookie)
      .send({ question: 'what did claire collins do?' });

    expect(response.status).toBe(200);
    expect(response.body.blocked).toBe(true);
    expect(response.body.answer).toBe(PII_REFUSAL);
    expect(JSON.stringify(response.body)).not.toContain('claire');
  });

  it('answers an unsupported question without calling Gemini', async () => {
    const { app: signed, cookie } = await signIn();
    const response = await request(signed)
      .post('/api/assistant')
      .set('Cookie', cookie)
      .send({ question: 'What is the weather in Lisbon?' });

    expect(response.status).toBe(200);
    expect(response.body.blocked).toBe(false);
    expect(response.body.answer).toMatch(/suggested questions/);
    expect(response.body.tables).toEqual([]);
  });

  it('blocks an email before a missing API key would matter', async () => {
    const { app: signed, cookie } = await signIn();
    const response = await request(signed)
      .post('/api/assistant')
      .set('Cookie', cookie)
      .send({ question: 'What did claire.collins447@gmail.com do?' });

    expect(response.status).toBe(200);
    expect(response.body.blocked).toBe(true);
    expect(response.body.answer).toBe(PII_REFUSAL);
    expect(JSON.stringify(response.body)).not.toContain('claire.collins447@gmail.com');
  });

  it('does not call Gemini when no key is set', async () => {
    const { app: signed, cookie } = await signIn();
    const response = await request(signed)
      .post('/api/assistant')
      .set('Cookie', cookie)
      .send({ question: 'How many Instagram signups went cold?' });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('service_unavailable');
  });

  it('stops after the assistant rate limit', async () => {
    const { app: signed, cookie } = await signIn();

    for (let attempt = 0; attempt < RATE_LIMITS.assistant.limit; attempt += 1) {
      const response = await request(signed)
        .post('/api/assistant')
        .set('Cookie', cookie)
        .send({ question: 'How many subscribers?' });
      expect([503, 200]).toContain(response.status);
    }

    const blocked = await request(signed)
      .post('/api/assistant')
      .set('Cookie', cookie)
      .send({ question: 'How many subscribers?' });
    expect(blocked.status).toBe(429);
  });
});

describe('isGeminiCapacityError', () => {
  it('treats Google high-demand 503s as busy, not as a broken assistant', () => {
    const error = new Error(
      '{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}',
    );

    expect(isGeminiCapacityError(error)).toBe(true);
    expect(isGeminiCapacityError(new Error('API key not valid'))).toBe(false);
  });

  it('treats an aborted generate as a timeout, not a hang', () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    const aborted = new Error('This operation was aborted');
    aborted.name = 'AbortError';

    expect(isGeminiTimeoutError(timeout)).toBe(true);
    expect(isGeminiTimeoutError(aborted)).toBe(true);
    expect(shouldTryFallback(aborted)).toBe(true);
    expect(isGeminiTimeoutError(new Error('API key not valid'))).toBe(false);
    expect(shouldTryFallback(new Error('API key not valid'))).toBe(false);
  });
});

describe('ask model-request boundary', () => {
  it('gives the model a job, not a scripted answer', () => {
    const prompt = systemInstruction();
    expect(prompt).toContain('Do not invent counts');
    expect(prompt).toContain('not signup date');
    expect(prompt).not.toContain('one or two plain sentences');
    expect(prompt).not.toContain('count_instagram_cold');
    expect(containsPii(prompt)).toBe(false);
  });

  it('keeps markdown for the app to render', () => {
    expect(plainAnswer('**552** Facebook signups')).toBe('**552** Facebook signups');
  });

  it('resolves a follow-up from the previous question, not from its prose', () => {
    const plan = planQuestion('how many of them unsubscribed?', [
      { question: 'how many facebook signups?', answer: 'There are 552 Facebook signups.' },
    ]);

    expect(plan).toMatchObject({
      ok: true,
      tool: 'count_segment',
      args: { acquisitionSource: 'Facebook', status: 'unsubscribed' },
    });
    expect(JSON.stringify(plan)).not.toContain('552');
    expect(JSON.stringify(plan)).not.toContain('how many facebook');
  });

  it('never calls Gemini when the question contains an email', async () => {
    const gemini = scriptedGemini([{ text: 'should not run' }]);

    const result = await ask('Tell me about claire.collins447@gmail.com', {
      gemini,
      model: 'test-model',
      createdBy: 'growth',
    });

    expect(gemini.requests).toEqual([]);
    expect(result.blocked).toBe(true);
    expect(result.answer).toBe(PII_REFUSAL);
  });

  it('never calls Gemini when the question names a person', async () => {
    const gemini = scriptedGemini([{ text: 'should not run' }]);

    const result = await ask('What did Claire Collins do?', {
      gemini,
      model: 'test-model',
      createdBy: 'growth',
    });

    expect(gemini.requests).toEqual([]);
    expect(result.blocked).toBe(true);
    expect(result.answer).toBe(PII_REFUSAL);
    expect(JSON.stringify(result)).not.toContain('Claire');
  });

  it('never calls Gemini for a lowercase name', async () => {
    const gemini = scriptedGemini([{ text: 'should not run' }]);

    const result = await ask('what did claire collins do?', {
      gemini,
      model: 'test-model',
      createdBy: 'growth',
    });

    expect(gemini.requests).toEqual([]);
    expect(result.blocked).toBe(true);
    expect(result.answer).toBe(PII_REFUSAL);
    expect(JSON.stringify(result)).not.toContain('claire');
  });

  it('never calls Gemini for a question it cannot map', async () => {
    const gemini = scriptedGemini([{ text: 'should not run' }]);

    const result = await ask('What is the weather in Lisbon?', {
      gemini,
      model: 'test-model',
      createdBy: 'growth',
    });

    expect(gemini.requests).toEqual([]);
    expect(result.blocked).toBe(false);
    expect(result.answer).toMatch(/suggested questions/);
  });

  it('does not keep a history turn that names a person', () => {
    const plan = planQuestion('how many facebook signups?', [
      { question: 'who is most active?', answer: 'Claire Collins is the most active reader.' },
    ]);

    expect(JSON.stringify(plan)).not.toContain('Claire');
    expect(plan).toMatchObject({ ok: true, tool: 'count_segment', args: { acquisitionSource: 'Facebook' } });
  });
});
