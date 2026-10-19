import { afterAll, describe, expect, it } from 'vitest';

import { closePool } from '../src/lib/db.js';
import { getOverview } from '../src/services/overview.js';
import { hasDatabase } from './helpers/database.js';

const describeDb = hasDatabase ? describe : describe.skip;

afterAll(closePool);

describeDb('overview figures', () => {
  it('reports the imported state, with unmatched records visible', async () => {
    const overview = await getOverview();

    expect(overview.referenceDate).toBe('2026-09-28');
    expect(overview.subscribers.total).toBe(2900);
    expect(overview.subscribers.active + overview.subscribers.unsubscribed).toBe(2900);

    expect(overview.app.withoutSubscriber).toBe(30);
    expect(overview.web.anonymous).toBe(628);

    expect(overview.app.accounts).toBe(overview.app.linkedToSubscriber + overview.app.withoutSubscriber);
    expect(overview.web.visitors).toBe(overview.web.identified + overview.web.anonymous);
  });

  it('counts never-opened subscribers as cold', async () => {
    const overview = await getOverview();

    expect(overview.coldWindowDays).toBe(30);
    expect(overview.subscribers.coldSinceCutoff).toBeGreaterThanOrEqual(overview.subscribers.neverOpened);
  });

  it('surfaces the skipped rows from the last import rather than burying them', async () => {
    const overview = await getOverview();
    const subscribers = overview.lastImports.find((run) => run.source === 'subscribers.csv');

    expect(subscribers?.rowsSkipped).toBe(10);
    expect(subscribers?.skipReasons).toEqual({ email_missing: 8, email_malformed: 2 });
  });
});
