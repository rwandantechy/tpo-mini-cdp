import { afterAll, describe, expect, it } from 'vitest';

import { ENGAGED_PRESET, INSTAGRAM_COLD_PRESET } from '../src/config/constants.js';
import { closePool } from '../src/lib/db.js';
import { assertNoPii, containsPii } from '../src/lib/pii.js';
import { ask } from '../src/services/assistant/ask.js';
import { firstPagesForNewSubscribers, snapshotCounts, subscriberBreakdown, topPages } from '../src/services/assistant/analytics.js';
import type { GeminiClient, GeminiRequest, GeminiTurn } from '../src/services/assistant/gemini.js';
import { runTool } from '../src/services/assistant/tools.js';
import { hasDatabase } from './helpers/database.js';

const describeDb = hasDatabase ? describe : describe.skip;

afterAll(closePool);

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

describeDb('assistant analytics', () => {
  it('returns headline counts with no identifiers', async () => {
    const snapshot = await snapshotCounts();

    expect(snapshot.subscribers).toBe(2900);
    expect(snapshot.instagramCold).toBe(229);
    expect(snapshot.instagramColdActive).toBe(174);
    expect(snapshot.coldSinceCutoff).toBeGreaterThan(0);
    expect(containsPii(JSON.stringify(snapshot))).toBe(false);
  });

  it('counts Instagram cold signups without listing them', async () => {
    const result = await runTool('count_segment', { ...INSTAGRAM_COLD_PRESET }, 'growth');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(229);
    expect(result.data).not.toHaveProperty('results');
    expect(result.segment).toBeUndefined();
    assertNoPii(result.data);
  });

  it('does not treat the 30-day cold window as a signup date filter', async () => {
    const result = await runTool(
      'count_segment',
      { acquisitionSource: 'Instagram', lastOpen: 'cold', signupFrom: '2026-08-29', signupTo: '2026-09-28' },
      'growth',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(229);
    expect(result.data.signupFrom).toBeUndefined();
    expect(result.table?.rows[0]).toMatchObject({ total: 229, source: 'Instagram', lastOpen: 'cold' });
    expect(result.table?.rows[0]).not.toHaveProperty('signupFrom');
  });

  it('accepts a lowercase source and keeps Facebook on a status filter', async () => {
    const facebook = await runTool('count_segment', { acquisitionSource: 'facebook' }, 'growth');
    const unsubscribed = await runTool(
      'count_segment',
      { acquisitionSource: 'facebook', status: 'unsubscribed' },
      'growth',
    );

    expect(facebook.ok).toBe(true);
    expect(unsubscribed.ok).toBe(true);
    if (!facebook.ok || !unsubscribed.ok) return;
    expect(facebook.data.total).toBe(552);
    expect(unsubscribed.data.total).toBe(48);
    expect(unsubscribed.table?.rows[0]).toMatchObject({ total: 48, source: 'Facebook', status: 'unsubscribed' });
  });

  it('saves most engaged readers without listing them', async () => {
    const result = await runTool(
      'save_segment',
      { name: 'Most engaged readers', definition: { ...ENGAGED_PRESET } },
      'growth',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.segment?.name).toBe('Most engaged readers');
    expect(result.segment?.definition).toMatchObject({ status: 'active', hasWebsite: true, hasApp: true });
    expect(result.data.total).toBeGreaterThan(0);
    expect(result.data).not.toHaveProperty('results');
    assertNoPii(result.data);
  });

  it('keeps breakdowns and page tables free of emails', async () => {
    const [breakdown, pages, first] = await Promise.all([
      subscriberBreakdown(),
      topPages(5),
      firstPagesForNewSubscribers(),
    ]);

    for (const table of [breakdown, pages, first]) {
      expect(table.rows.length).toBeGreaterThan(0);
      assertNoPii(table);
      expect(JSON.stringify(table)).not.toMatch(/@/);
    }

    expect(breakdown.rows[0]).toMatchObject({
      source: 'Instagram',
      total: 899,
      active: 806,
      unsubscribed: 93,
      share: '31%',
    });
  });

  it('sends Gemini only the question, system prompt, and aggregate tool results', async () => {
    const gemini = scriptedGemini([
      {
        functionCalls: [{ name: 'count_segment', args: { ...INSTAGRAM_COLD_PRESET } }],
        modelContent: {
          role: 'model',
          parts: [{ functionCall: { name: 'count_segment', args: { ...INSTAGRAM_COLD_PRESET } } }],
        },
      },
      { text: '229 Instagram signups have not opened in 30 days.' },
    ]);

    const result = await ask('How many Instagram signups went cold?', {
      gemini,
      model: 'test-model',
      createdBy: 'growth',
    });

    const sent = JSON.stringify(gemini.requests);
    expect(gemini.requests).toHaveLength(2);
    expect(sent).not.toMatch(/@/);
    expect(sent).not.toContain('claire');
    expect(gemini.requests[0]?.contents).toEqual([
      { role: 'user', parts: [{ text: 'How many Instagram signups went cold?' }] },
    ]);
    expect(JSON.stringify(gemini.requests[1]?.contents)).toContain('"total":229');
    expect(result.answer).toContain('229');
    expect(result.tables[0]?.rows[0]?.total).toBe(229);
  });
});
