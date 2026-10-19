import { describe, expect, it } from 'vitest';

import { SAMPLE_APP_EVENT } from '../src/config/constants.js';
import { assertNoPii, containsPii, findPii } from '../src/lib/pii.js';
import { PII_REFUSAL, systemInstruction } from '../src/services/assistant/ask.js';
import { planQuestion } from '../src/services/assistant/plan.js';

describe('findPii', () => {
  it('flags an email in a sentence', () => {
    expect(findPii('What has claire.collins447@gmail.com done lately?')).toEqual(['email']);
  });

  it('flags app, device, and event ids from the assessment payload', () => {
    expect(findPii(`look up ${SAMPLE_APP_EVENT.user_id}`)).toEqual(['app_user']);
    expect(findPii(`device ${SAMPLE_APP_EVENT.device_id}`)).toEqual(['device']);
    expect(findPii(`event ${SAMPLE_APP_EVENT.event_id}`)).toEqual(['event']);
  });

  it('flags a first and last name in either case', () => {
    expect(findPii('What did Claire Collins do?')).toEqual(['name']);
    expect(findPii('what did claire collins do?')).toEqual(['name']);
  });

  it('lets ordinary Growth questions through', () => {
    expect(containsPii('How many Instagram signups went cold in the last 30 days?')).toBe(false);
    expect(containsPii('Which pages do new subscribers hit first?')).toBe(false);
    expect(containsPii('Build a list of our most engaged readers')).toBe(false);
    expect(containsPii('Unsubscribe Rate Performance')).toBe(false);
    expect(containsPii('229 Instagram signups have not opened in 30 days.')).toBe(false);
  });
});

describe('planQuestion', () => {
  it('does not put the question text on the plan', () => {
    const plan = planQuestion('  How many Instagram signups went cold in the last 30 days?  ');
    expect(plan).toEqual({
      ok: true,
      tool: 'count_segment',
      args: { acquisitionSource: 'Instagram', lastOpen: 'cold' },
      definition: { acquisitionSource: 'Instagram', lastOpen: 'cold' },
    });
    expect(JSON.stringify(plan)).not.toContain('How many');
  });

  it('refuses an email without planning a tool', () => {
    expect(planQuestion('Tell me about claire.collins447@gmail.com')).toEqual({ ok: false, reason: 'pii' });
  });

  it('refuses a named person in either case', () => {
    expect(planQuestion('What did Claire Collins do?')).toEqual({ ok: false, reason: 'pii' });
    expect(planQuestion('what did claire collins do?')).toEqual({ ok: false, reason: 'pii' });
  });
});

describe('systemInstruction', () => {
  it('does not contain an email or a person', () => {
    expect(containsPii(systemInstruction())).toBe(false);
    expect(systemInstruction()).not.toMatch(/@/);
  });
});

describe('assertNoPii', () => {
  it('throws if a tool result smuggled an email', () => {
    expect(() => assertNoPii({ emails: ['claire.collins447@gmail.com'] })).toThrow(/email/);
  });

  it('allows aggregate rows', () => {
    expect(() => assertNoPii({ title: 'Top pages', rows: [{ page: '/subscribe', views: 12 }] })).not.toThrow();
  });
});

describe('PII_REFUSAL', () => {
  it('does not echo the person back', () => {
    expect(PII_REFUSAL).not.toMatch(/@/);
    expect(containsPii(PII_REFUSAL)).toBe(false);
  });
});
