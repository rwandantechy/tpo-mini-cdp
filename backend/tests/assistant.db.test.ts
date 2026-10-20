import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { ENGAGED_PRESET, INSTAGRAM_COLD_PRESET } from '../src/config/constants.js';
import { closePool, query } from '../src/lib/db.js';
import { serviceUnavailable } from '../src/lib/errors.js';
import { assertNoPii, containsPii } from '../src/lib/pii.js';
import { ask, PII_REFUSAL } from '../src/services/assistant/ask.js';
import { firstPagesForNewSubscribers, snapshotCounts, subscriberBreakdown, topPages } from '../src/services/assistant/analytics.js';
import type { GeminiClient, GeminiRequest, GeminiTurn } from '../src/services/assistant/llm.js';
import { planQuestion } from '../src/services/assistant/plan.js';
import { runTool } from '../src/services/assistant/tools.js';
import { countSegment, previewSegment } from '../src/services/segments.js';
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

  it('uses the same filters as the segment screen', async () => {
    const cold = { ...INSTAGRAM_COLD_PRESET };
    const coldAndNew = {
      ...INSTAGRAM_COLD_PRESET,
      signupFrom: '2026-08-29',
      signupTo: '2026-09-28',
    };

    const [coldCount, coldPreview, coldTool, bothCount, bothPreview, bothTool] = await Promise.all([
      countSegment(cold),
      previewSegment(cold, { limit: 1 }),
      runTool('count_segment', cold, 'growth'),
      countSegment(coldAndNew),
      previewSegment(coldAndNew, { limit: 1 }),
      runTool('count_segment', coldAndNew, 'growth'),
    ]);

    expect(coldCount.total).toBe(229);
    expect(coldPreview.total).toBe(229);
    expect(coldTool.ok && coldTool.data.total).toBe(229);

    expect(bothCount.total).toBe(48);
    expect(bothPreview.total).toBe(48);
    expect(bothTool.ok && bothTool.data.total).toBe(48);
    if (bothTool.ok) expect(bothTool.data.signupFrom).toBe('2026-08-29');
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

  it('counts a page view on or after signup, not an earlier visit', async () => {
    const visitorId = `v_reg_${randomUUID()}`;
    const before = `/reg-before-${randomUUID()}`;
    const after = `/reg-after-${randomUUID()}`;
    const email = `first-page-${randomUUID()}@example.com`;
    let subscriberId: string | undefined;

    try {
      const inserted = await query<{ id: string }>(
        `
        insert into subscribers (email_normalized, email_original, signup_date, status, acquisition_source)
        values ($1, $1, '2026-09-01', 'active', 'Direct')
        returning id
        `,
        [email],
      );
      subscriberId = inserted[0]?.id;
      await query(
        `
        insert into web_visitors (visitor_id, subscriber_id, identified_at, first_seen_at, last_seen_at)
        values ($1, $2, '2026-09-01T12:00:00Z', '2026-08-01T00:00:00Z', '2026-09-01T12:00:00Z')
        `,
        [visitorId, subscriberId],
      );
      await query(
        `
        insert into web_events (visitor_id, page, occurred_at, email_captured)
        values ($1, $2, '2026-08-01T00:00:00Z', false), ($1, $3, '2026-09-01T12:00:00Z', false)
        `,
        [visitorId, before, after],
      );

      const table = await firstPagesForNewSubscribers(30, 1000);
      const pages = table.rows.map((row) => row.page);

      expect(pages).toContain(after);
      expect(pages).not.toContain(before);
    } finally {
      await query('delete from web_visitors where visitor_id = $1', [visitorId]);
      if (subscriberId) await query('delete from subscribers where id = $1', [subscriberId]);
    }
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

  it('sends Gemini the aggregate only, then drops a reply that names someone', async () => {
    const gemini = scriptedGemini([
      { text: '229 Instagram signups have not opened in 30 days.' },
    ]);

    const result = await ask('How many Instagram signups went cold in the last 30 days?', {
      gemini,
      model: 'test-model',
      createdBy: 'growth',
      history: [
        { question: 'what about claire.collins447@gmail.com', answer: 'blocked' },
        { question: 'who is most active?', answer: 'Claire Collins is the most active reader.' },
      ],
    });

    const sent = JSON.parse(String(gemini.requests[0]?.contents[0]?.parts?.[0]?.text)) as {
      total: number;
      filters: { lastOpen: string };
    };
    expect(gemini.requests).toHaveLength(1);
    expect(gemini.requests[0]?.includeTools).toBe(false);
    expect(JSON.stringify(gemini.requests)).not.toMatch(/@/);
    expect(JSON.stringify(gemini.requests)).not.toContain('claire');
    expect(JSON.stringify(gemini.requests)).not.toContain('Claire');
    expect(JSON.stringify(gemini.requests)).not.toContain('How many Instagram');
    expect(sent.total).toBe(229);
    expect(sent.filters.lastOpen).toBe('cold');
    expect(result.answer).toContain('229');
    expect(result.blocked).toBe(false);
    expect(result.tables[0]?.rows[0]?.total).toBe(229);

    const named = scriptedGemini([{ text: 'Claire Collins is one of them.' }]);
    const refused = await ask('How many Instagram signups went cold in the last 30 days?', {
      gemini: named,
      model: 'test-model',
      createdBy: 'growth',
    });
    expect(JSON.stringify(named.requests)).not.toContain('Claire');
    expect(refused.blocked).toBe(true);
    expect(refused.answer).toBe(PII_REFUSAL);
    expect(refused.tables).toEqual([]);

    const followUp = scriptedGemini([{ text: '48 Facebook signups are unsubscribed.' }]);
    const followed = await ask('how many of them unsubscribed?', {
      gemini: followUp,
      model: 'test-model',
      createdBy: 'growth',
      history: [{ question: 'how many facebook signups?', answer: 'There are 552 Facebook signups.' }],
    });
    const followSent = JSON.parse(String(followUp.requests[0]?.contents[0]?.parts?.[0]?.text)) as {
      total: number;
      filters: { acquisitionSource: string; status: string };
    };
    expect(JSON.stringify(followUp.requests)).not.toContain('how many facebook');
    expect(JSON.stringify(followUp.requests)).not.toContain('There are 552');
    expect(followSent.filters).toMatchObject({ acquisitionSource: 'Facebook', status: 'unsubscribed' });
    expect(followSent.total).toBe(48);
    expect(followed.answer).toContain('48');

    const timedOut: GeminiClient = {
      async generate() {
        throw serviceUnavailable('The assistant took too long. Try again.');
      },
    };
    const kept = await ask('How many Instagram signups went cold in the last 30 days?', {
      gemini: timedOut,
      model: 'test-model',
      createdBy: 'growth',
    });
    expect(kept.blocked).toBe(false);
    expect(kept.answer).toBe('229.');
    expect(kept.tables[0]?.rows[0]?.total).toBe(229);

    const planned = planQuestion('How many Instagram signups signed up in the last 30 days and went cold?');
    expect(planned.ok).toBe(true);
    if (!planned.ok || !planned.definition) return;
    expect(await countSegment(planned.definition)).toMatchObject({ total: 48 });
  });
});
