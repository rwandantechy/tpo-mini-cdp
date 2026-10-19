import { afterAll, describe, expect, it } from 'vitest';

import { randomUUID } from 'node:crypto';

import { ENGAGED_PRESET, INSTAGRAM_COLD_PRESET } from '../src/config/constants.js';
import { closePool } from '../src/lib/db.js';
import { deleteSegment, previewSegment, saveSegment } from '../src/services/segments.js';
import { hasDatabase } from './helpers/database.js';

const describeDb = hasDatabase ? describe : describe.skip;

afterAll(closePool);

describeDb('previewSegment', () => {
  it('finds Instagram signups who have not opened in 30 days, against the reference date', async () => {
    const page = await previewSegment({ ...INSTAGRAM_COLD_PRESET }, { limit: 100, offset: 0 });

    expect(page.cutoffDate).toBe('2026-08-29');
    expect(page.total).toBe(229);
    expect(page.results.every((person) => person.acquisitionSource === 'Instagram')).toBe(true);
    expect(page.results.every((person) => person.lastOpenDate === null || person.lastOpenDate < '2026-08-29')).toBe(
      true,
    );
  });

  it('can narrow that group to people still active', async () => {
    const page = await previewSegment({ ...INSTAGRAM_COLD_PRESET, status: 'active' }, { limit: 1, offset: 0 });

    expect(page.total).toBe(174);
  });

  it('pages through a segment', async () => {
    const first = await previewSegment({ ...INSTAGRAM_COLD_PRESET }, { limit: 10, offset: 0 });
    const second = await previewSegment({ ...INSTAGRAM_COLD_PRESET }, { limit: 10, offset: 10 });

    expect(first.results).toHaveLength(10);
    expect(second.results).toHaveLength(10);
    expect(second.results[0]?.id).not.toBe(first.results[0]?.id);
  });
});

describeDb('saveSegment', () => {
  it('replaces an existing name instead of stacking another chip', async () => {
    const name = `test-${randomUUID()}`;
    const first = await saveSegment(name, { ...INSTAGRAM_COLD_PRESET }, 'growth');
    const second = await saveSegment(name.toUpperCase(), { ...ENGAGED_PRESET }, 'growth');

    expect(second.id).toBe(first.id);
    expect(second.definition).toMatchObject(ENGAGED_PRESET);

    expect(await deleteSegment(first.id)).toBe(true);
    expect(await deleteSegment(first.id)).toBe(false);
  });
});
